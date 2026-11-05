"""Result revisions, faculty edits, and approval decisions."""

import copy
import json

from botocore.exceptions import ClientError

from app import agents, audit
from app.jobs import (
    DRAFT,
    JobError,
    _key,
    _query,
    _table,
    now_iso,
    require_job,
    revision_sk,
    store_revision,
)

APPROVED = "APPROVED"
REJECTED = "REJECTED"
SAFETY_CLEARED = {"NOT_REQUIRED", "PASSED"}

RECOMMENDATION_FIELDS = {
    "title",
    "target",
    "proposed_change",
    "recommendation",
    "coursework_description",
    "rationale",
    "implementation_steps",
}
ASSIGNMENT_FIELDS = {"title", "student_prompt", "deliverable", "ai_policy"}
OBJECTIVE_FIELDS = {"gap_notes", "coverage"}
COVERAGE_VALUES = {"STRONG", "PARTIAL", "GAP"}


def get_revision(user_id: str, analysis_id: str, revision: int) -> dict:
    item = _table().get_item(Key=_key(user_id, revision_sk(analysis_id, revision))).get("Item")
    if not item or item.get("itemType") != "REVISION":
        raise JobError(404, "NOT_FOUND", "We couldn't find that version of the results.")
    return {**item, "content": json.loads(item["body"])}


def list_revisions(user_id: str, analysis_id: str) -> list[dict]:
    items = [i for i in _query(user_id, f"{analysis_id}#rev#") if i.get("itemType") == "REVISION"]
    return sorted(items, key=lambda i: int(i["revision"]))


def _apply_edits(content: dict, edits: dict) -> None:
    recs = (content.get(agents.RECOMMENDATIONS) or {}).get("recommendations", [])
    by_id = {r["id"]: r for r in recs}
    for rec_id, changes in (edits.get(agents.RECOMMENDATIONS) or {}).items():
        target = by_id.get(rec_id)
        if not target:
            raise JobError(400, "UNKNOWN_ITEM", f"Recommendation {rec_id} isn't in this result.")
        for field, value in changes.items():
            if field == "excluded":
                target["excluded"] = bool(value)
            elif field == "implementation_steps":
                target[field] = [str(s).strip() for s in value if str(s).strip()][:12]
            elif field == "assignment":
                if not isinstance(value, dict):
                    raise JobError(400, "INVALID_VALUE", "Assignment must be an object.")
                current = target.get("assignment") if isinstance(target.get("assignment"), dict) else {}
                updated = {
                    "title": str(current.get("title") or ""),
                    "student_prompt": str(current.get("student_prompt") or ""),
                    "deliverable": str(current.get("deliverable") or ""),
                    "ai_policy": str(current.get("ai_policy") or ""),
                }
                for key, raw in value.items():
                    if key not in ASSIGNMENT_FIELDS:
                        raise JobError(400, "FIELD_NOT_EDITABLE", f"assignment.{key} can't be edited.")
                    limit = 2000 if key == "student_prompt" else 500
                    updated[key] = str(raw).strip()[:limit]
                target["assignment"] = updated
            elif field in RECOMMENDATION_FIELDS:
                target[field] = str(value).strip()[:4000]
            else:
                raise JobError(400, "FIELD_NOT_EDITABLE", f"{field} can't be edited.")

    objectives = (content.get(agents.COMPETENCIES) or {}).get("objectives", [])
    by_id = {o["id"]: o for o in objectives}
    for obj_id, changes in (edits.get(agents.COMPETENCIES) or {}).items():
        target = by_id.get(obj_id)
        if not target:
            raise JobError(400, "UNKNOWN_ITEM", f"Objective {obj_id} isn't in this result.")
        for field, value in changes.items():
            if field == "coverage" and value not in COVERAGE_VALUES:
                raise JobError(400, "INVALID_VALUE", "Coverage must be STRONG, PARTIAL, or GAP.")
            if field == "excluded":
                target["excluded"] = bool(value)
            elif field in OBJECTIVE_FIELDS:
                target[field] = str(value).strip()[:4000]
            else:
                raise JobError(400, "FIELD_NOT_EDITABLE", f"{field} can't be edited.")


def edit(user_id: str, analysis_id: str, base_revision: int, edits: dict) -> int:
    """Save faculty edits as a new DRAFT revision. Citations and evidence are never edited."""
    job = require_job(user_id, analysis_id)
    if int(job.get("latestRevision", 0)) != base_revision:
        raise JobError(409, "REVISION_CONFLICT", "A newer version exists. Reload before editing.")
    base = get_revision(user_id, analysis_id, base_revision)
    content = copy.deepcopy(base["content"])
    _apply_edits(content, edits)
    revision = store_revision(
        user_id=user_id,
        analysis_id=analysis_id,
        content=content,
        origin="EDITED",
        actor_id=user_id,
        base_revision=base_revision,
        part_attempts=base.get("partAttempts", {}),
    )
    audit.record(
        f"user#{user_id}", "RESULT_EDITED", user_id, analysis_id, revision=revision, base=base_revision
    )
    return revision


def decide(
    user_id: str,
    reviewer_name: str,
    analysis_id: str,
    revision: int,
    decision: str,
    comment: str,
) -> dict:
    job = require_job(user_id, analysis_id)
    if int(job.get("latestRevision", 0)) != revision:
        raise JobError(409, "NOT_LATEST", "Only the latest version can be approved or rejected.")
    rev = get_revision(user_id, analysis_id, revision)
    if rev["reviewStatus"] != DRAFT:
        raise JobError(409, "ALREADY_REVIEWED", "This version was already reviewed.")
    if decision == APPROVED:
        if not rev.get("complete"):
            raise JobError(
                409,
                "INCOMPLETE_RESULT",
                "Both recommendations and competency mapping are needed before approval. "
                "Retry the part that failed.",
            )
        if rev.get("safetyStatus") not in SAFETY_CLEARED:
            raise JobError(409, "SAFETY_UNRESOLVED", "This version has an unresolved safety check.")

    now = now_iso()
    try:
        _table().update_item(
            Key=_key(user_id, revision_sk(analysis_id, revision)),
            UpdateExpression="SET reviewStatus = :decision, reviewedBy = :user, "
            "reviewerName = :name, reviewedAt = :now, reviewComment = :comment",
            ConditionExpression="reviewStatus = :draft",
            ExpressionAttributeValues={
                ":decision": decision,
                ":user": user_id,
                ":name": reviewer_name,
                ":now": now,
                ":comment": comment[:1000],
                ":draft": DRAFT,
            },
        )
        expression = "SET reviewStatus = :decision, reviewedAt = :now, updatedAt = :now"
        values = {":decision": decision, ":now": now, ":rev": revision}
        if decision == APPROVED:
            expression += ", approvedRevision = :rev"
        _table().update_item(
            Key=_key(user_id, analysis_id),
            UpdateExpression=expression,
            ConditionExpression="latestRevision = :rev",
            ExpressionAttributeValues=values,
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise JobError(409, "REVISION_CONFLICT", "This result changed. Reload and try again.") from exc
        raise
    audit.record(
        f"user#{user_id}",
        "RESULT_APPROVED" if decision == APPROVED else "RESULT_REJECTED",
        user_id,
        analysis_id,
        revision=revision,
    )
    return get_revision(user_id, analysis_id, revision)
