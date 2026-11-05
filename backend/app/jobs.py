"""Analysis jobs: creation, the worker, deadline sweeping, and retries.

Job state (QUEUED/RUNNING/SUCCEEDED/PARTIALLY_SUCCEEDED/FAILED) is separate from the review
state of result revisions (DRAFT/APPROVED/REJECTED). Every worker write is conditioned on the
job's current attempt, so duplicate or late deliveries cannot overwrite newer state.
"""

import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import UTC, datetime, timedelta

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from app import agents, audit, observability
from app.aws import s3, table
from app.config import get_settings

log = logging.getLogger("phact.jobs")

QUEUED = "QUEUED"
RUNNING = "RUNNING"
SUCCEEDED = "SUCCEEDED"
PARTIALLY_SUCCEEDED = "PARTIALLY_SUCCEEDED"
FAILED = "FAILED"
ACTIVE_STATES = (QUEUED, RUNNING)
RETRYABLE_STATES = (FAILED, PARTIALLY_SUCCEEDED)

PART_PENDING = "PENDING"
PART_RUNNING = "RUNNING"
PART_SUCCEEDED = "SUCCEEDED"
PART_FAILED = "FAILED"

DRAFT = "DRAFT"
SAFETY_NOT_REQUIRED = "NOT_REQUIRED"

IDEMPOTENCY_NAMESPACE = uuid.UUID("7b0f7a52-0c8b-4b8e-9d55-2f1f3c6c9a10")

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="phact-worker")


class JobError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _table():
    return table(get_settings().analyses_table)


def _key(user_id: str, sort_key: str) -> dict:
    return {"userId": user_id, "analysisId": sort_key}


def part_sk(analysis_id: str, part: str, attempt: int) -> str:
    return f"{analysis_id}#part#{part}#{attempt:02d}"


def revision_sk(analysis_id: str, revision: int) -> str:
    return f"{analysis_id}#rev#{revision:04d}"


def input_key(user_id: str, analysis_id: str) -> str:
    return f"users/{user_id}/analyses/{analysis_id}/input.txt"


def _conditional_failed(exc: ClientError) -> bool:
    return exc.response["Error"]["Code"] == "ConditionalCheckFailedException"


def _empty_part() -> dict:
    return {"status": PART_PENDING, "stage": "", "errorCode": "", "message": "", "retryable": False}


# ---------- Reads ----------


def get_job(user_id: str, analysis_id: str) -> dict | None:
    item = _table().get_item(Key=_key(user_id, analysis_id)).get("Item")
    return item if item and item.get("itemType") == "JOB" else None


def require_job(user_id: str, analysis_id: str) -> dict:
    job = get_job(user_id, analysis_id)
    if not job:
        raise JobError(404, "NOT_FOUND", "We couldn't find that analysis.")
    return job


def _query(user_id: str, prefix: str | None = None) -> list[dict]:
    condition = Key("userId").eq(user_id)
    if prefix:
        condition &= Key("analysisId").begins_with(prefix)
    items: list[dict] = []
    kwargs = {"KeyConditionExpression": condition}
    while True:
        page = _table().query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def list_jobs(user_id: str) -> list[dict]:
    jobs = [i for i in _query(user_id) if i.get("itemType") == "JOB"]
    jobs.sort(key=lambda j: j.get("createdAt", ""), reverse=True)
    return jobs


def read_input(user_id: str, analysis_id: str) -> str:
    body = s3().get_object(Bucket=get_settings().uploads_bucket, Key=input_key(user_id, analysis_id))
    return body["Body"].read().decode("utf-8")


def input_available(job: dict) -> bool:
    return job.get("inputExpiresAt", "") > now_iso()


def can_retry(job: dict) -> bool:
    settings = get_settings()
    under_retry_cap = int(job.get("attempt", 1)) < settings.analysis_max_attempts
    # Faculty refine failures share the attempt counter; still allow retry while under refine cap.
    feedback_retry = bool(str(job.get("facultyFeedback") or "").strip()) and (
        int(job.get("refineCount", 0)) <= settings.analysis_max_refines
    )
    return (
        job.get("jobStatus") in RETRYABLE_STATES
        and bool(job.get("retryable"))
        and (under_retry_cap or feedback_retry)
        and input_available(job)
    )


# ---------- Creation ----------


def analysis_id_for(user_id: str, idempotency_key: str) -> str:
    return uuid.uuid5(IDEMPOTENCY_NAMESPACE, f"{user_id}:{idempotency_key}").hex


def create_job(
    *,
    user_id: str,
    analysis_id: str,
    syllabus: dict,
    scrubbed_text: str,
    redactions: dict[str, int],
    truncated: bool,
) -> tuple[dict, bool]:
    """Store the scrubbed input and a QUEUED job. Returns (job, created)."""
    settings = get_settings()
    s3().put_object(
        Bucket=settings.uploads_bucket,
        Key=input_key(user_id, analysis_id),
        Body=scrubbed_text.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
    )
    now = datetime.now(UTC)
    item = {
        "userId": user_id,
        "analysisId": analysis_id,
        "itemType": "JOB",
        "syllabusId": syllabus["syllabusId"],
        "courseTitle": syllabus.get("title", "Untitled syllabus"),
        "courseCode": syllabus.get("courseCode", ""),
        "gradeLevel": syllabus.get("gradeLevel", ""),
        "courseFocus": syllabus.get("courseFocus", ""),
        "term": syllabus.get("term", ""),
        "jobStatus": QUEUED,
        "attempt": 1,
        "attemptId": uuid.uuid4().hex,
        "parts": {p: _empty_part() for p in agents.PARTS},
        "retryable": False,
        "redactions": redactions,
        "inputChars": len(scrubbed_text),
        "truncated": truncated,
        "inputPolicyVersion": settings.guardrail_version,
        "inputExpiresAt": (now + timedelta(days=settings.scrubbed_input_retention_days)).isoformat(),
        "deadlineAt": (now + timedelta(seconds=settings.analysis_deadline_seconds)).isoformat(),
        "latestRevision": 0,
        "createdAt": now.isoformat(),
        "updatedAt": now.isoformat(),
    }
    try:
        _table().put_item(Item=item, ConditionExpression="attribute_not_exists(analysisId)")
    except ClientError as exc:
        if _conditional_failed(exc):
            return require_job(user_id, analysis_id), False
        raise
    audit.record(f"user#{user_id}", "ANALYSIS_REQUESTED", user_id, analysis_id, attempt=1)
    observability.info(
        log,
        "analysis_queued",
        analysis_id=analysis_id,
        attempt=1,
        input_chars=len(scrubbed_text),
        redaction_total=sum(int(v) for v in redactions.values()),
        truncated=truncated,
    )
    observability.metric("AnalysisQueued", 1)
    return item, True


def dispatch(user_id: str, analysis_id: str, attempt: int) -> None:
    event = {"userId": user_id, "analysisId": analysis_id, "attempt": attempt}
    if get_settings().local_worker:
        _executor.submit(_handle_safely, event)
    else:
        raise RuntimeError("Deployed worker dispatch is not configured")


def _handle_safely(event: dict) -> None:
    try:
        handle(event)
    except Exception as exc:
        observability.error(
            log,
            "worker_crashed",
            analysis_id=str(event.get("analysisId") or "")[:64],
            error_type=type(exc).__name__,
        )
        observability.metric("WorkerCrash", 1)


# ---------- Worker ----------


def handle(event: dict) -> None:
    """Worker entry point; also the future Lambda handler body."""
    run(event["userId"], event["analysisId"], int(event["attempt"]))


def run(user_id: str, analysis_id: str, attempt: int) -> None:
    try:
        _table().update_item(
            Key=_key(user_id, analysis_id),
            UpdateExpression="SET jobStatus = :running, startedAt = :now, updatedAt = :now, "
            "workerId = :worker",
            ConditionExpression="jobStatus = :queued AND attempt = :attempt",
            ExpressionAttributeValues={
                ":running": RUNNING,
                ":queued": QUEUED,
                ":attempt": attempt,
                ":now": now_iso(),
                ":worker": uuid.uuid4().hex,
            },
        )
    except ClientError as exc:
        if _conditional_failed(exc):
            log.info("analysis %s attempt %d already claimed; skipping", analysis_id, attempt)
            return
        raise

    job = require_job(user_id, analysis_id)
    prior_raw = job.get("priorRecommendations") or []
    if isinstance(prior_raw, str):
        try:
            prior_raw = json.loads(prior_raw)
        except ValueError:
            prior_raw = []
    data = agents.AgentInput(
        course_title=job["courseTitle"],
        course_code=job.get("courseCode", ""),
        text=read_input(user_id, analysis_id),
        grade_level=str(job.get("gradeLevel") or ""),
        course_focus=str(job.get("courseFocus") or ""),
        term=str(job.get("term") or ""),
        feedback=str(job.get("facultyFeedback") or ""),
        prior_recommendations=prior_raw if isinstance(prior_raw, list) else [],
    )
    todo = [p for p in agents.PARTS if job["parts"][p]["status"] != PART_SUCCEEDED]
    deadline = datetime.fromisoformat(job["deadlineAt"])
    budget = min(
        get_settings().analysis_agent_timeout_seconds,
        max(1.0, (deadline - datetime.now(UTC)).total_seconds()),
    )

    pool = ThreadPoolExecutor(max_workers=len(todo), thread_name_prefix=f"agent-{analysis_id[:6]}")
    futures = {pool.submit(_run_part, user_id, analysis_id, attempt, p, data): p for p in todo}
    _, still_running = wait(futures, timeout=budget)
    pool.shutdown(wait=False)
    for future in still_running:
        _set_part(
            user_id,
            analysis_id,
            attempt,
            futures[future],
            {
                "status": PART_FAILED,
                "stage": "",
                "errorCode": "AGENT_TIMEOUT",
                "message": "This part took too long to finish.",
                "retryable": True,
            },
            require_status=PART_RUNNING,
        )
    finish(user_id, analysis_id, attempt)


def _set_part(
    user_id: str,
    analysis_id: str,
    attempt: int,
    part: str,
    values: dict,
    require_status: str | None = None,
) -> bool:
    names = {"#parts": "parts", "#p": part, "#jobStatus": "jobStatus", "#attempt": "attempt"}
    attr_values: dict = {":attempt": attempt, ":running": RUNNING, ":now": now_iso()}
    sets = ["updatedAt = :now"]
    for k, v in values.items():
        names[f"#{k}"] = k
        attr_values[f":{k}"] = v
        sets.append(f"#parts.#p.#{k} = :{k}")
    condition = "#attempt = :attempt AND #jobStatus = :running"
    if require_status:
        names["#status"] = "status"
        attr_values[":required"] = require_status
        condition += " AND #parts.#p.#status = :required"
    try:
        _table().update_item(
            Key=_key(user_id, analysis_id),
            UpdateExpression="SET " + ", ".join(sets),
            ConditionExpression=condition,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=attr_values,
        )
        return True
    except ClientError as exc:
        if _conditional_failed(exc):
            return False
        raise


def _run_part(user_id: str, analysis_id: str, attempt: int, part: str, data) -> None:
    started = _set_part(
        user_id,
        analysis_id,
        attempt,
        part,
        {
            "status": PART_RUNNING,
            "stage": "RETRIEVING_SOURCES",
            "errorCode": "",
            "message": "",
            "retryable": False,
            "startedAt": now_iso(),
        },
    )
    if not started:
        return

    def on_stage(stage: str) -> None:
        _set_part(user_id, analysis_id, attempt, part, {"stage": stage}, PART_RUNNING)

    try:
        body = agents.AGENTS[part](data, on_stage)
    except agents.AgentError as exc:
        observability.warning(
            log,
            "agent_part_failed",
            analysis_id=analysis_id,
            part=part,
            attempt=attempt,
            error_code=exc.code,
            retryable=exc.retryable,
        )
        observability.metric(
            "AgentPart",
            1,
            dimensions={"Part": part, "Result": "failed"},
        )
        _set_part(
            user_id,
            analysis_id,
            attempt,
            part,
            {
                "status": PART_FAILED,
                "stage": "",
                "errorCode": exc.code,
                "message": exc.message,
                "retryable": exc.retryable,
            },
            PART_RUNNING,
        )
        return
    except Exception as exc:
        observability.error(
            log,
            "agent_failed",
            analysis_id=analysis_id,
            part=part,
            attempt=attempt,
            error_type=type(exc).__name__,
        )
        observability.metric(
            "AgentPart",
            1,
            dimensions={"Part": part, "Result": "error"},
        )
        _set_part(
            user_id,
            analysis_id,
            attempt,
            part,
            {
                "status": PART_FAILED,
                "stage": "",
                "errorCode": "INTERNAL_ERROR",
                "message": "Something went wrong in this part of the analysis.",
                "retryable": True,
            },
            PART_RUNNING,
        )
        return

    try:
        _table().put_item(
            Item={
                **_key(user_id, part_sk(analysis_id, part, attempt)),
                "itemType": "PART",
                "part": part,
                "attempt": attempt,
                "body": agents.dumps(body),
                "createdAt": now_iso(),
            },
            ConditionExpression="attribute_not_exists(analysisId)",
        )
    except ClientError as exc:
        if not _conditional_failed(exc):
            raise
    _set_part(
        user_id,
        analysis_id,
        attempt,
        part,
        {
            "status": PART_SUCCEEDED,
            "stage": "",
            "attempt": attempt,
            "finishedAt": now_iso(),
            **agents.summarize(part, body),
        },
        PART_RUNNING,
    )
    observability.info(
        log,
        "agent_part_succeeded",
        analysis_id=analysis_id,
        part=part,
        attempt=attempt,
    )
    observability.metric(
        "AgentPart",
        1,
        dimensions={"Part": part, "Result": "ok"},
    )


def finish(user_id: str, analysis_id: str, attempt: int, timed_out: bool = False) -> None:
    """Move a job to its terminal state. Safe to call more than once."""
    job = get_job(user_id, analysis_id)
    if not job or int(job["attempt"]) != attempt or job["jobStatus"] not in ACTIVE_STATES:
        return
    parts = job["parts"]
    if timed_out:
        for part in agents.PARTS:
            if parts[part]["status"] != PART_SUCCEEDED:
                parts[part].update(
                    status=PART_FAILED,
                    stage="",
                    errorCode="DEADLINE_EXCEEDED",
                    message="The analysis didn't finish in time.",
                    retryable=True,
                )
    succeeded = [p for p in agents.PARTS if parts[p]["status"] == PART_SUCCEEDED]
    failed = [p for p in agents.PARTS if parts[p]["status"] != PART_SUCCEEDED]
    for part in failed:
        if parts[part]["status"] != PART_FAILED:
            parts[part].update(
                status=PART_FAILED,
                stage="",
                errorCode=parts[part].get("errorCode") or "INCOMPLETE",
                message=parts[part].get("message") or "This part didn't finish.",
                retryable=True,
            )
    status = SUCCEEDED if not failed else PARTIALLY_SUCCEEDED if succeeded else FAILED
    retryable = any(parts[p].get("retryable") for p in failed)
    try:
        _table().update_item(
            Key=_key(user_id, analysis_id),
            UpdateExpression="SET jobStatus = :status, parts = :parts, retryable = :retryable, "
            "finishedAt = :now, updatedAt = :now",
            ConditionExpression="attempt = :attempt AND jobStatus IN (:queued, :running)",
            ExpressionAttributeValues={
                ":status": status,
                ":parts": parts,
                ":retryable": retryable,
                ":now": now_iso(),
                ":attempt": attempt,
                ":queued": QUEUED,
                ":running": RUNNING,
            },
        )
    except ClientError as exc:
        if _conditional_failed(exc):
            return
        raise
    observability.info(
        log,
        "analysis_finished",
        analysis_id=analysis_id,
        attempt=attempt,
        status=status,
        succeeded_parts=len(succeeded),
        failed_parts=len(failed),
    )
    observability.metric(
        "AnalysisFinished",
        1,
        dimensions={"Status": status},
    )

    new_this_attempt = any(int(parts[p].get("attempt", 0)) == attempt for p in succeeded)
    if succeeded and new_this_attempt:
        _create_generated_revision(user_id, analysis_id, job, succeeded, attempt)


def _create_generated_revision(
    user_id: str, analysis_id: str, job: dict, succeeded: list[str], attempt: int
) -> None:
    content: dict = {}
    part_attempts: dict = {}
    for part in succeeded:
        part_attempt = int(job["parts"][part]["attempt"])
        item = _table().get_item(Key=_key(user_id, part_sk(analysis_id, part, part_attempt)))["Item"]
        content[part] = json.loads(item["body"])
        part_attempts[part] = part_attempt
    origin = "REFINED" if str(job.get("facultyFeedback") or "").strip() else "GENERATED"
    store_revision(
        user_id=user_id,
        analysis_id=analysis_id,
        content=content,
        origin=origin,
        actor_id="phact-worker",
        base_revision=int(job.get("latestRevision", 0)),
        part_attempts=part_attempts,
        source_attempt=attempt,
    )


def store_revision(
    *,
    user_id: str,
    analysis_id: str,
    content: dict,
    origin: str,
    actor_id: str,
    base_revision: int,
    part_attempts: dict,
    source_attempt: int | None = None,
) -> int:
    """Write an immutable DRAFT revision and point the job at it.
    Fails with a conflict if another revision was created from the same base."""
    revision = base_revision + 1
    complete = all(content.get(p) for p in agents.PARTS)
    now = now_iso()
    item = {
        **_key(user_id, revision_sk(analysis_id, revision)),
        "itemType": "REVISION",
        "revision": revision,
        "baseRevision": base_revision,
        "origin": origin,
        "body": agents.dumps(content),
        "parts": [p for p in agents.PARTS if content.get(p)],
        "partAttempts": part_attempts,
        "complete": complete,
        "reviewStatus": DRAFT,
        "safetyStatus": SAFETY_NOT_REQUIRED,
        "createdAt": now,
        "createdBy": actor_id,
    }
    if source_attempt is not None:
        item["sourceAttempt"] = source_attempt
    try:
        _table().put_item(Item=item, ConditionExpression="attribute_not_exists(analysisId)")
        _table().update_item(
            Key=_key(user_id, analysis_id),
            UpdateExpression="SET latestRevision = :rev, reviewStatus = :draft, updatedAt = :now, "
            "recommendationCount = :recs, competencyCount = :comps",
            ConditionExpression="latestRevision = :base",
            ExpressionAttributeValues={
                ":rev": revision,
                ":draft": DRAFT,
                ":now": now,
                ":base": base_revision,
                ":recs": len((content.get(agents.RECOMMENDATIONS) or {}).get("recommendations", [])),
                ":comps": sum(
                    1
                    for o in (content.get(agents.COMPETENCIES) or {}).get("objectives", [])
                    if o.get("matches")
                ),
            },
        )
    except ClientError as exc:
        if _conditional_failed(exc):
            raise JobError(
                409, "REVISION_CONFLICT", "This result changed since you opened it. Reload and try again."
            ) from exc
        raise
    return revision


# ---------- Deadlines and retries ----------


def sweep_expired() -> int:
    """Fail jobs whose server deadline passed, even if their worker died without cleanup."""
    now = now_iso()
    expired: list[dict] = []
    kwargs = {
        "FilterExpression": Attr("itemType").eq("JOB")
        & Attr("jobStatus").is_in(list(ACTIVE_STATES))
        & Attr("deadlineAt").lt(now),
        "ProjectionExpression": "userId, analysisId, attempt",
    }
    while True:
        page = _table().scan(**kwargs)
        expired.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    for job in expired:
        finish(job["userId"], job["analysisId"], int(job["attempt"]), timed_out=True)
    return len(expired)


def can_regenerate(job: dict) -> bool:
    settings = get_settings()
    return (
        job["jobStatus"] not in ACTIVE_STATES
        and int(job.get("refineCount", 0)) < settings.analysis_max_refines
        and input_available(job)
        and int(job.get("latestRevision", 0)) > 0
    )


def retry(user_id: str, analysis_id: str, recheck_input) -> dict:
    """Start a linked attempt that reruns only the failed parts with the retained input."""
    settings = get_settings()
    job = require_job(user_id, analysis_id)
    if job["jobStatus"] in ACTIVE_STATES:
        return job  # a repeated click while a retry is already running
    if job["jobStatus"] not in RETRYABLE_STATES:
        raise JobError(409, "NOTHING_TO_RETRY", "This analysis has nothing to retry.")
    if not job.get("retryable"):
        raise JobError(
            409, "NOT_RETRYABLE", "This failure can't be fixed by trying again. Check the syllabus."
        )
    attempt = int(job["attempt"])
    feedback = str(job.get("facultyFeedback") or "").strip()
    refine_count = int(job.get("refineCount", 0))
    if attempt >= settings.analysis_max_attempts and not (
        feedback and refine_count <= settings.analysis_max_refines
    ):
        raise JobError(409, "RETRY_LIMIT", "This analysis reached its retry limit. Start a new one.")
    if not input_available(job):
        raise JobError(410, "INPUT_EXPIRED", "The saved syllabus text expired. Start a new analysis.")
    if job.get("inputPolicyVersion") != settings.guardrail_version:
        recheck_input(read_input(user_id, analysis_id))

    parts = job["parts"]
    for part in agents.PARTS:
        if parts[part]["status"] != PART_SUCCEEDED:
            parts[part] = _empty_part()
    now = datetime.now(UTC)
    try:
        _table().update_item(
            Key=_key(user_id, analysis_id),
            UpdateExpression="SET jobStatus = :queued, attempt = :next, retryOf = :prev, "
            "attemptId = :attemptId, parts = :parts, retryable = :false, deadlineAt = :deadline, "
            "inputPolicyVersion = :policy, updatedAt = :now REMOVE finishedAt",
            ConditionExpression="attempt = :attempt AND jobStatus IN (:failed, :partial)",
            ExpressionAttributeValues={
                ":queued": QUEUED,
                ":next": attempt + 1,
                ":prev": job["attemptId"],
                ":attemptId": uuid.uuid4().hex,
                ":parts": parts,
                ":false": False,
                ":deadline": (now + timedelta(seconds=settings.analysis_deadline_seconds)).isoformat(),
                ":policy": settings.guardrail_version,
                ":now": now.isoformat(),
                ":attempt": attempt,
                ":failed": FAILED,
                ":partial": PARTIALLY_SUCCEEDED,
            },
        )
    except ClientError as exc:
        if _conditional_failed(exc):
            return require_job(user_id, analysis_id)
        raise
    audit.record(f"user#{user_id}", "ANALYSIS_RETRIED", user_id, analysis_id, attempt=attempt + 1)
    dispatch(user_id, analysis_id, attempt + 1)
    return require_job(user_id, analysis_id)


def regenerate(user_id: str, analysis_id: str, feedback: str, recheck_input) -> dict:
    """Faculty refine-until-accept: re-run recommendations with feedback and optional tools."""
    settings = get_settings()
    feedback = (feedback or "").strip()
    if len(feedback) < 8:
        raise JobError(
            400,
            "FEEDBACK_REQUIRED",
            "Tell the AI what to change (at least a short sentence).",
        )
    if len(feedback) > 2000:
        raise JobError(400, "FEEDBACK_TOO_LONG", "Keep feedback under 2000 characters.")

    job = require_job(user_id, analysis_id)
    if job["jobStatus"] in ACTIVE_STATES:
        raise JobError(409, "STILL_RUNNING", "Wait for the current analysis to finish.")
    refine_count = int(job.get("refineCount", 0))
    if refine_count >= settings.analysis_max_refines:
        raise JobError(
            409,
            "REFINE_LIMIT",
            "This analysis reached its refine limit. Start a new analysis to continue.",
        )
    if not input_available(job):
        raise JobError(410, "INPUT_EXPIRED", "The saved syllabus text expired. Start a new analysis.")
    if int(job.get("latestRevision", 0)) < 1:
        raise JobError(409, "NO_RESULT", "Generate recommendations before refining them.")
    if job.get("inputPolicyVersion") != settings.guardrail_version:
        recheck_input(read_input(user_id, analysis_id))

    prior: list = []
    try:
        from app import review as review_mod

        rev = review_mod.get_revision(user_id, analysis_id, int(job["latestRevision"]))
        prior = (rev.get("content") or {}).get(agents.RECOMMENDATIONS, {}).get("recommendations") or []
    except JobError:
        prior = []

    attempt = int(job["attempt"])
    parts = {p: dict(job["parts"][p]) for p in agents.PARTS}
    parts[agents.RECOMMENDATIONS] = _empty_part()
    # Keep succeeded competencies so the new revision can stay complete.
    now = datetime.now(UTC)
    next_attempt = attempt + 1
    try:
        _table().update_item(
            Key=_key(user_id, analysis_id),
            UpdateExpression="SET jobStatus = :queued, attempt = :next, retryOf = :prev, "
            "attemptId = :attemptId, parts = :parts, retryable = :false, deadlineAt = :deadline, "
            "inputPolicyVersion = :policy, facultyFeedback = :feedback, "
            "priorRecommendations = :prior, refineCount = :refine, updatedAt = :now "
            "REMOVE finishedAt",
            ConditionExpression="attempt = :attempt AND jobStatus IN (:succeeded, :partial, :failed)",
            ExpressionAttributeValues={
                ":queued": QUEUED,
                ":next": next_attempt,
                ":prev": job["attemptId"],
                ":attemptId": uuid.uuid4().hex,
                ":parts": parts,
                ":false": False,
                ":deadline": (now + timedelta(seconds=settings.analysis_deadline_seconds)).isoformat(),
                ":policy": settings.guardrail_version,
                ":feedback": feedback,
                ":prior": json.dumps(prior, ensure_ascii=False),
                ":refine": refine_count + 1,
                ":now": now.isoformat(),
                ":attempt": attempt,
                ":succeeded": SUCCEEDED,
                ":partial": PARTIALLY_SUCCEEDED,
                ":failed": FAILED,
            },
        )
    except ClientError as exc:
        if _conditional_failed(exc):
            raise JobError(
                409, "REVISION_CONFLICT", "This analysis changed. Reload and try again."
            ) from exc
        raise
    audit.record(
        f"user#{user_id}",
        "ANALYSIS_REGENERATED",
        user_id,
        analysis_id,
        attempt=next_attempt,
        refine=refine_count + 1,
    )
    dispatch(user_id, analysis_id, next_attempt)
    return require_job(user_id, analysis_id)
