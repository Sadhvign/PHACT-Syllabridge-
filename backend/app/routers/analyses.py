import logging
from typing import Literal

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field

from app import agents, exports, jobs, observability, review, safety
from app.audit import record
from app.auth import User, get_current_user
from app.config import get_settings
from app.course_context import label_focus, label_grade, label_term
from app.routers.syllabi import CONFIRMED, _get_item, _read_text

log = logging.getLogger("phact.api")
router = APIRouter(prefix="/api/analyses", tags=["analyses"])

STAGE_LABELS = {
    "RETRIEVING_SOURCES": "Retrieving ASPPH sources",
    "GENERATING": "Writing",
    "REFINING": "Refining from your feedback",
    "CONSULTING_TOOLS": "Consulting sources and tools",
}


class StartRequest(BaseModel):
    syllabus_id: str = Field(min_length=1, max_length=64)


class EditRequest(BaseModel):
    base_revision: int = Field(ge=1)
    edits: dict[str, dict[str, dict]]


class DecisionRequest(BaseModel):
    decision: Literal["APPROVE", "REJECT"]
    comment: str = Field(default="", max_length=1000)


class RegenerateRequest(BaseModel):
    feedback: str = Field(min_length=8, max_length=2000)
    reject_revision: int | None = Field(default=None, ge=1)


class ExportRequest(BaseModel):
    revision: int = Field(ge=1)
    format: Literal["DOCX", "PDF"]


def _raise(exc: jobs.JobError):
    raise HTTPException(exc.status, exc.message) from exc


def _part_view(part: dict) -> dict:
    return {
        "status": part.get("status"),
        "stage": part.get("stage", ""),
        "error_code": part.get("errorCode", ""),
        "message": part.get("message", ""),
        "retryable": bool(part.get("retryable")),
        "count": int(part.get("count", 0)),
    }


def _job_view(job: dict) -> dict:
    return {
        "analysis_id": job["analysisId"],
        "syllabus_id": job["syllabusId"],
        "course_title": job["courseTitle"],
        "course_code": job.get("courseCode", ""),
        "grade_level": job.get("gradeLevel", ""),
        "course_focus": job.get("courseFocus", ""),
        "term": job.get("term", ""),
        "grade_level_label": label_grade(job.get("gradeLevel", "")),
        "course_focus_label": label_focus(job.get("courseFocus", "")),
        "term_label": label_term(job.get("term", "")),
        "job_status": job["jobStatus"],
        "attempt": int(job.get("attempt", 1)),
        "max_attempts": get_settings().analysis_max_attempts,
        "parts": {p: _part_view(job["parts"][p]) for p in agents.PARTS},
        "can_retry": jobs.can_retry(job),
        "can_regenerate": jobs.can_regenerate(job),
        "refine_count": int(job.get("refineCount", 0)),
        "max_refines": get_settings().analysis_max_refines,
        "faculty_feedback": job.get("facultyFeedback", "") if job["jobStatus"] in jobs.ACTIVE_STATES else "",
        "redactions": {k: int(v) for k, v in job.get("redactions", {}).items()},
        "truncated": bool(job.get("truncated")),
        "input_policy_version": job.get("inputPolicyVersion", ""),
        "latest_revision": int(job.get("latestRevision", 0)),
        "approved_revision": int(job.get("approvedRevision", 0)),
        "review_status": job.get("reviewStatus", ""),
        "recommendation_count": int(job.get("recommendationCount", 0)),
        "competency_count": int(job.get("competencyCount", 0)),
        "created_at": job.get("createdAt", ""),
        "started_at": job.get("startedAt", ""),
        "finished_at": job.get("finishedAt", ""),
        "deadline_at": job.get("deadlineAt", ""),
    }


def _revision_view(rev: dict) -> dict:
    return {
        "revision": int(rev["revision"]),
        "base_revision": int(rev.get("baseRevision", 0)),
        "origin": rev.get("origin", ""),
        "complete": bool(rev.get("complete")),
        "parts": rev.get("parts", []),
        "review_status": rev.get("reviewStatus", ""),
        "safety_status": rev.get("safetyStatus", ""),
        "reviewer_name": rev.get("reviewerName", ""),
        "reviewed_at": rev.get("reviewedAt", ""),
        "review_comment": rev.get("reviewComment", ""),
        "created_at": rev.get("createdAt", ""),
        "content": rev.get("content"),
    }


def _export_view(item: dict) -> dict:
    return {
        "export_id": item["exportId"],
        "format": item["format"],
        "revision": int(item["revision"]),
        "file_name": item["fileName"],
        "size_bytes": int(item.get("sizeBytes", 0)),
        "reviewer_name": item.get("reviewerName", ""),
        "approved_at": item.get("approvedAt", ""),
        "created_at": item["createdAt"],
    }


def _check_input(user: User, text: str) -> None:
    try:
        result = safety.check_input(text)
    except (ClientError, BotoCoreError, RuntimeError) as exc:
        observability.warning(
            log,
            "guardrail_unavailable",
            error_type=type(exc).__name__,
        )
        observability.metric("GuardrailAvailability", 1, dimensions={"Result": "error"})
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "PHACT's safety check is unavailable right now. Please try again in a minute.",
        ) from exc
    if not result.passed:
        record(f"user#{user.user_id}", "INPUT_BLOCKED", user.user_id, "analysis", code=result.code)
        observability.metric(
            "InputBlocked",
            1,
            dimensions={"Code": result.code[:40]},
        )
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, result.message)


@router.get("")
def list_analyses(user: User = Depends(get_current_user)) -> list[dict]:
    return [_job_view(j) for j in jobs.list_jobs(user.user_id)]


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def start_analysis(
    request: StartRequest,
    response: Response,
    idempotency_key: str = Header(min_length=8, max_length=80),
    user: User = Depends(get_current_user),
) -> dict:
    analysis_id = jobs.analysis_id_for(user.user_id, idempotency_key)
    existing = jobs.get_job(user.user_id, analysis_id)
    if existing:
        response.status_code = status.HTTP_200_OK
        return _job_view(existing)

    syllabus = _get_item(user, request.syllabus_id)
    if syllabus.get("status") != CONFIRMED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Confirm the syllabus text before analysis.")
    if not (
        syllabus.get("gradeLevel") and syllabus.get("courseFocus") and syllabus.get("term")
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Open the syllabus and set grade level, course focus, and term before analysis.",
        )
    text = _read_text(syllabus.get("confirmedTextKey"))
    max_chars = get_settings().analysis_max_input_chars
    truncated = len(text) > max_chars
    text = text[:max_chars]

    try:
        scrubbed = safety.scrub_pii(text)
    except (ClientError, BotoCoreError) as exc:
        observability.warning(
            log,
            "pii_scrub_unavailable",
            error_type=type(exc).__name__,
        )
        observability.metric("PiiScrub", 1, dimensions={"Result": "error"})
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "PHACT's privacy check is unavailable right now. Please try again in a minute.",
        ) from exc
    _check_input(user, scrubbed.text)

    job, created = jobs.create_job(
        user_id=user.user_id,
        analysis_id=analysis_id,
        syllabus=syllabus,
        scrubbed_text=scrubbed.text,
        redactions=scrubbed.redactions,
        truncated=truncated,
    )
    if created:
        jobs.dispatch(user.user_id, analysis_id, 1)
    else:
        response.status_code = status.HTTP_200_OK
    return _job_view(job)


@router.get("/{analysis_id}")
def get_analysis(analysis_id: str, user: User = Depends(get_current_user)) -> dict:
    try:
        job = jobs.require_job(user.user_id, analysis_id)
    except jobs.JobError as exc:
        _raise(exc)
    view = _job_view(job)
    view["revisions"] = [
        {k: v for k, v in _revision_view(r).items() if k != "content"}
        for r in review.list_revisions(user.user_id, analysis_id)
    ]
    return view


@router.post("/{analysis_id}/retry")
def retry_analysis(analysis_id: str, user: User = Depends(get_current_user)) -> dict:
    try:
        return _job_view(
            jobs.retry(user.user_id, analysis_id, lambda text: _check_input(user, text))
        )
    except jobs.JobError as exc:
        _raise(exc)


@router.post("/{analysis_id}/regenerate", status_code=status.HTTP_202_ACCEPTED)
def regenerate_analysis(
    analysis_id: str,
    request: RegenerateRequest,
    user: User = Depends(get_current_user),
) -> dict:
    """Reject (optional) then regenerate recommendations from faculty feedback."""
    if request.reject_revision is not None:
        try:
            review.decide(
                user.user_id,
                user.display_name,
                analysis_id,
                request.reject_revision,
                review.REJECTED,
                request.feedback,
            )
        except jobs.JobError as exc:
            if exc.code != "ALREADY_REVIEWED":
                _raise(exc)
    try:
        return _job_view(
            jobs.regenerate(
                user.user_id,
                analysis_id,
                request.feedback,
                lambda text: _check_input(user, text),
            )
        )
    except jobs.JobError as exc:
        _raise(exc)


@router.get("/{analysis_id}/input")
def get_input(analysis_id: str, user: User = Depends(get_current_user)) -> dict:
    try:
        job = jobs.require_job(user.user_id, analysis_id)
    except jobs.JobError as exc:
        _raise(exc)
    if not jobs.input_available(job):
        raise HTTPException(status.HTTP_410_GONE, "The saved syllabus text has expired.")
    return {"text": jobs.read_input(user.user_id, analysis_id)}


@router.get("/{analysis_id}/revisions/{revision}")
def get_revision(analysis_id: str, revision: int, user: User = Depends(get_current_user)) -> dict:
    try:
        jobs.require_job(user.user_id, analysis_id)
        return _revision_view(review.get_revision(user.user_id, analysis_id, revision))
    except jobs.JobError as exc:
        _raise(exc)


@router.post("/{analysis_id}/revisions", status_code=status.HTTP_201_CREATED)
def save_edits(
    analysis_id: str, request: EditRequest, user: User = Depends(get_current_user)
) -> dict:
    try:
        revision = review.edit(user.user_id, analysis_id, request.base_revision, request.edits)
        return _revision_view(review.get_revision(user.user_id, analysis_id, revision))
    except jobs.JobError as exc:
        _raise(exc)


@router.post("/{analysis_id}/revisions/{revision}/decision")
def decide(
    analysis_id: str,
    revision: int,
    request: DecisionRequest,
    user: User = Depends(get_current_user),
) -> dict:
    decision = review.APPROVED if request.decision == "APPROVE" else review.REJECTED
    try:
        rev = review.decide(
            user.user_id, user.display_name, analysis_id, revision, decision, request.comment
        )
        return _revision_view(rev)
    except jobs.JobError as exc:
        _raise(exc)


@router.get("/{analysis_id}/exports")
def list_exports(analysis_id: str, user: User = Depends(get_current_user)) -> list[dict]:
    try:
        jobs.require_job(user.user_id, analysis_id)
    except jobs.JobError as exc:
        _raise(exc)
    return [_export_view(e) for e in exports.list_exports(user.user_id, analysis_id)]


@router.post("/{analysis_id}/exports", status_code=status.HTTP_201_CREATED)
def create_export(
    analysis_id: str, request: ExportRequest, user: User = Depends(get_current_user)
) -> dict:
    try:
        university = user.university
        return _export_view(
            exports.create(
                user.user_id, analysis_id, request.revision, request.format,
                university.name if university else "",
            )
        )
    except jobs.JobError as exc:
        _raise(exc)


@router.post("/{analysis_id}/exports/{export_id}/link")
def export_link(
    analysis_id: str, export_id: str, user: User = Depends(get_current_user)
) -> dict:
    try:
        return exports.download_link(user.user_id, analysis_id, export_id)
    except jobs.JobError as exc:
        _raise(exc)
