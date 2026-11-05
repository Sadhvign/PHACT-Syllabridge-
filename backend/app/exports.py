"""Private exports of an approved result revision."""

import re
import uuid
from datetime import UTC, datetime, timedelta

from app import agents, audit, provenance, report
from app.aws import s3
from app.config import get_settings
from app.jobs import JobError, _key, _query, _table, now_iso, require_job
from app.review import APPROVED, SAFETY_CLEARED, get_revision

FORMATS = {
    "DOCX": (
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        report.build_docx,
    ),
    "PDF": ("pdf", "application/pdf", report.build_pdf),
}


def export_sk(analysis_id: str, export_id: str) -> str:
    return f"{analysis_id}#export#{export_id}"


def _file_name(job: dict, extension: str, revision: int) -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "-", job.get("courseCode") or job["courseTitle"]).strip("-")
    return f"PHACT-{base[:40] or 'report'}-v{revision}.{extension}"


def approved_report(
    user_id: str, analysis_id: str, revision: int, university_name: str = ""
) -> tuple[dict, dict, report.ReportData]:
    """Load an approved, complete, safety-cleared revision and its AI-versus-faculty provenance."""
    job = require_job(user_id, analysis_id)
    if int(job.get("approvedRevision", 0)) != revision:
        raise JobError(
            409, "NOT_APPROVED", "Only an approved version can be exported. Approve it first."
        )
    rev = get_revision(user_id, analysis_id, revision)
    if rev["reviewStatus"] != APPROVED:
        raise JobError(409, "NOT_APPROVED", "Only an approved version can be exported.")
    if not rev.get("complete") or not all(rev["content"].get(p) for p in agents.PARTS):
        raise JobError(409, "INCOMPLETE_RESULT", "The approved version is missing part of the report.")
    if rev.get("safetyStatus") not in SAFETY_CLEARED:
        raise JobError(409, "SAFETY_UNRESOLVED", "This version has an unresolved safety check.")
    data = report.ReportData(
        course_title=job["courseTitle"],
        course_code=job.get("courseCode", ""),
        revision=revision,
        reviewer_name=rev.get("reviewerName", ""),
        approved_at=rev.get("reviewedAt", ""),
        content=rev["content"],
        provenance=provenance.compute(user_id, analysis_id, revision, rev["content"]),
        university_name=university_name,
    )
    return job, rev, data


def create(user_id: str, analysis_id: str, revision: int, fmt: str, university_name: str = "") -> dict:
    if fmt not in FORMATS:
        raise JobError(400, "UNSUPPORTED_FORMAT", "Choose DOCX or PDF.")
    job, rev, data = approved_report(user_id, analysis_id, revision, university_name)
    extension, content_type, build = FORMATS[fmt]
    body = build(data)
    export_id = uuid.uuid4().hex
    key = f"exports/{user_id}/{analysis_id}/{export_id}.{extension}"
    s3().put_object(
        Bucket=get_settings().exports_bucket, Key=key, Body=body, ContentType=content_type
    )
    item = {
        **_key(user_id, export_sk(analysis_id, export_id)),
        "itemType": "EXPORT",
        "exportId": export_id,
        "format": fmt,
        "revision": revision,
        "reviewedBy": rev.get("reviewedBy", ""),
        "reviewerName": rev.get("reviewerName", ""),
        "approvedAt": rev.get("reviewedAt", ""),
        "objectKey": key,
        "fileName": _file_name(job, extension, revision),
        "sizeBytes": len(body),
        "createdAt": now_iso(),
    }
    _table().put_item(Item=item)
    audit.record(
        f"user#{user_id}", "EXPORT_CREATED", user_id, analysis_id, revision=revision, format=fmt
    )
    return item


def list_exports(user_id: str, analysis_id: str) -> list[dict]:
    items = [i for i in _query(user_id, f"{analysis_id}#export#") if i.get("itemType") == "EXPORT"]
    return sorted(items, key=lambda i: i["createdAt"], reverse=True)


def download_link(user_id: str, analysis_id: str, export_id: str) -> dict:
    """Issue a short-lived signed link. Anyone holding it can download until it expires."""
    item = _table().get_item(Key=_key(user_id, export_sk(analysis_id, export_id))).get("Item")
    if not item or item.get("itemType") != "EXPORT":
        raise JobError(404, "NOT_FOUND", "We couldn't find that export.")
    ttl = get_settings().export_link_ttl_seconds
    url = s3().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": get_settings().exports_bucket,
            "Key": item["objectKey"],
            "ResponseContentDisposition": f'attachment; filename="{item["fileName"]}"',
        },
        ExpiresIn=ttl,
    )
    expires_at = (datetime.now(UTC) + timedelta(seconds=ttl)).isoformat()
    return {"url": url, "expires_at": expires_at, "file_name": item["fileName"]}
