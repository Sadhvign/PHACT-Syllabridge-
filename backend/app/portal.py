"""Sharing with colleagues, repository submissions to ASPPH, feedback, and admin analytics.

Shares and submissions are snapshots: the approved report and its provenance are copied to the
community bucket when the faculty member shares or submits, so recipients and admins never read
a teacher's private analysis records.
"""

import json
import re
import uuid
from collections import Counter, defaultdict
from decimal import Decimal

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from app import audit, report, universities
from app.auth import User
from app.aws import cognito, s3, table
from app.config import get_settings
from app.exports import approved_report
from app.jobs import JobError, now_iso, require_job
from app.safety import scrub_pii

PENDING, ACCEPTED, DECLINED = "PENDING", "ACCEPTED", "DECLINED"
LINK, EMAIL = "LINK", "EMAIL"
VIEW = "VIEW"
GROUP_INDEX = "byGroup"
LINK_TTL = 300
EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _community():
    return table(get_settings().community_table)


def _feedback():
    return table(get_settings().feedback_table)


def _bucket() -> str:
    return get_settings().community_bucket


def _plain(value):
    """DynamoDB returns numbers as Decimal; convert for JSON and arithmetic."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_plain(v) for v in value]
    return value


def _clean(text: str, limit: int) -> str:
    text = (text or "").strip()[:limit]
    return scrub_pii(text).text if text else ""


def _member(user: User) -> universities.University:
    university = user.university
    if not universities.is_member(university):
        raise JobError(403, "NOT_FACULTY", "Only faculty at member universities can do this.")
    return university


def _group(group_key: str) -> list[dict]:
    items: list[dict] = []
    kwargs = {"IndexName": GROUP_INDEX, "KeyConditionExpression": Key("groupKey").eq(group_key),
              "ScanIndexForward": False}
    while True:
        page = _community().query(**kwargs)
        items.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return [_plain(i) for i in items]
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def _scan(table_resource, **kwargs) -> list[dict]:
    items: list[dict] = []
    while True:
        page = table_resource.scan(**kwargs)
        items.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return [_plain(i) for i in items]
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def _signed(key: str, file_name: str, inline: bool = False) -> str:
    disposition = "inline" if inline else "attachment"
    return s3().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": _bucket(),
            "Key": key,
            "ResponseContentDisposition": f'{disposition}; filename="{file_name}"',
            "ResponseContentType": "application/pdf",
        },
        ExpiresIn=LINK_TTL,
    )


def _file_name(snapshot: dict, suffix: str = "") -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "-", snapshot.get("courseCode") or snapshot["courseTitle"]).strip("-")
    return f"PHACT-{base[:40] or 'report'}-v{snapshot['revision']}{suffix}.pdf"


def _changes(data: report.ReportData) -> list[dict]:
    """Item-level summary of what faculty changed, for admins and the repository note."""
    out: list[dict] = []
    titles = {r["id"]: r["title"] for r in data.section("recommendations", "recommendations")}
    titles.update({o["id"]: o["objective"] for o in data.section("competencies", "objectives")})
    for kind in ("recommendations", "objectives"):
        for item_id, entry in (data.provenance.get(kind) or {}).items():
            if entry["status"] != "KEPT":
                out.append({
                    "kind": kind, "id": item_id, "title": titles.get(item_id, item_id),
                    "status": entry["status"], "fields": entry["fields"],
                })
    return out


def _snapshot(user: User, analysis_id: str, prefix: str) -> tuple[dict, report.ReportData]:
    """Copy the approved report into the community bucket and return its metadata."""
    university = _member(user)
    job = require_job(user.user_id, analysis_id)
    revision = int(job.get("approvedRevision", 0))
    if not revision:
        raise JobError(409, "NOT_APPROVED", "Approve the results before sharing them.")
    _, rev, data = approved_report(user.user_id, analysis_id, revision, university.name)
    stats = data.provenance.get("stats", {})
    snapshot = {
        "analysisId": analysis_id,
        "revision": revision,
        "courseTitle": job["courseTitle"],
        "courseCode": job.get("courseCode", ""),
        "gradeLevel": job.get("gradeLevel", ""),
        "courseFocus": job.get("courseFocus", ""),
        "term": job.get("term", ""),
        "ownerId": user.user_id,
        "ownerName": user.display_name,
        "ownerEmail": user.email,
        "universityId": university.id,
        "universityName": university.name,
        "approvedAt": rev.get("reviewedAt", ""),
        "stats": stats,
        "changes": _changes(data),
        "recommendationCount": len(data.recommendations()),
        "objectiveCount": len(data.objectives()),
        "pdfKey": f"{prefix}/report.pdf",
        "contentKey": f"{prefix}/content.json",
    }
    s3().put_object(Bucket=_bucket(), Key=snapshot["pdfKey"], Body=report.build_pdf(data),
                    ContentType="application/pdf")
    s3().put_object(
        Bucket=_bucket(), Key=snapshot["contentKey"], ContentType="application/json",
        Body=json.dumps({"content": data.content, "provenance": data.provenance,
                         "reviewerName": data.reviewer_name}).encode(),
    )
    return snapshot, data


# ---------------------------------------------------------------- sharing

def create_link(user: User, analysis_id: str) -> dict:
    share_id = uuid.uuid4().hex
    snapshot, _ = _snapshot(user, analysis_id, f"shares/{share_id}")
    item = {"itemId": f"SHARE#{share_id}", "itemType": "SHARE", "shareId": share_id, "kind": LINK,
            "permission": VIEW, "createdAt": now_iso(), **snapshot}
    _community().put_item(Item=item)
    audit.record(f"user#{user.user_id}", "SHARE_LINK_CREATED", user.user_id, analysis_id, share=share_id)
    return _plain(item)


def _account_exists(email: str) -> bool:
    users = cognito().list_users(
        UserPoolId=get_settings().user_pool_id, Filter=f'email = "{email}"', Limit=1
    )["Users"]
    return bool(users) and users[0].get("Enabled", True)


def check_recipient(sender: User, email: str) -> str:
    """Return an error message, or empty when the colleague can receive a share."""
    if not EMAIL_PATTERN.match(email):
        return "Enter a valid email address."
    if email == sender.email:
        return "That's your own address."
    if not universities.is_member(universities.for_email(email)):
        return "Only colleagues at PHACT member universities can receive shares."
    if not _account_exists(email):
        return "No PHACT account uses this email."
    return ""


def share_by_email(user: User, analysis_id: str, emails: list[str], message: str) -> list[dict]:
    """Validate recipients and add the report to their PHACT inbox. No email is sent."""
    _member(user)
    recipients = list(dict.fromkeys(e.strip().lower() for e in emails if e.strip()))
    if not recipients:
        raise JobError(400, "NO_RECIPIENTS", "Add at least one colleague's email.")
    if len(recipients) > 10:
        raise JobError(400, "TOO_MANY_RECIPIENTS", "Share with up to 10 colleagues at a time.")
    results = [{"email": e, "error": check_recipient(user, e)} for e in recipients]
    if any(r["error"] for r in results):
        return [{**r, "shared": False} for r in results]

    share_id = uuid.uuid4().hex
    snapshot, _ = _snapshot(user, analysis_id, f"shares/{share_id}")
    note = _clean(message, 1000)
    now = now_iso()
    for recipient in recipients:
        _community().put_item(Item={
            "itemId": f"SHARE#{share_id}#{recipient}", "itemType": "SHARE", "shareId": share_id,
            "kind": EMAIL, "permission": VIEW, "recipientEmail": recipient, "message": note,
            "groupKey": f"INBOX#{recipient}", "createdAt": now, **snapshot,
        })
    audit.record(f"user#{user.user_id}", "SHARE_EMAIL_CREATED", user.user_id, analysis_id,
                 share=share_id, recipients=len(recipients))
    return [{**r, "shared": True} for r in results]


def get_share(user: User, share_id: str) -> dict:
    """Any signed-in member-university faculty or ASPPH admin can open a link share."""
    if not (user.is_admin or universities.is_member(user.university)):
        raise JobError(403, "FORBIDDEN", "Sign in with a member university account.")
    item = _community().get_item(Key={"itemId": f"SHARE#{share_id}"}).get("Item")
    if not item:
        inbox = _community().get_item(Key={"itemId": f"SHARE#{share_id}#{user.email}"}).get("Item")
        item = inbox
    if not item or (item.get("kind") == EMAIL and item.get("recipientEmail") != user.email
                    and item.get("ownerId") != user.user_id):
        raise JobError(404, "NOT_FOUND", "This shared report isn't available to you.")
    item = _plain(item)
    name = _file_name(item)
    return {**item, "pdfUrl": _signed(item["pdfKey"], name, inline=True),
            "downloadUrl": _signed(item["pdfKey"], name)}


def inbox(user: User) -> list[dict]:
    return _group(f"INBOX#{user.email}")


# ---------------------------------------------------------------- repository submissions

def submit(user: User, analysis_id: str, note: str) -> dict:
    university = _member(user)
    for existing in _group(f"UNI#{university.id}"):
        if existing["analysisId"] == analysis_id and existing["status"] in (PENDING, ACCEPTED) \
                and existing["ownerId"] == user.user_id:
            job = require_job(user.user_id, analysis_id)
            if int(existing["revision"]) == int(job.get("approvedRevision", 0)):
                raise JobError(409, "ALREADY_SUBMITTED", "This version is already in the repository queue.")
    submission_id = uuid.uuid4().hex
    snapshot, _ = _snapshot(user, analysis_id, f"submissions/{submission_id}")
    item = {
        "itemId": f"SUB#{submission_id}", "itemType": "SUBMISSION", "submissionId": submission_id,
        "groupKey": f"UNI#{university.id}", "status": PENDING, "facultyNote": _clean(note, 1000),
        "createdAt": now_iso(), **snapshot,
    }
    _community().put_item(Item=item)
    audit.record(f"user#{user.user_id}", "REPOSITORY_SUBMITTED", user.user_id, analysis_id,
                 submission=submission_id)
    return _plain(item)


def my_submissions(user: User) -> list[dict]:
    university = user.university
    if not universities.is_member(university):
        return []
    return [s for s in _group(f"UNI#{university.id}") if s["ownerId"] == user.user_id]


def _require_submission(submission_id: str) -> dict:
    item = _community().get_item(Key={"itemId": f"SUB#{submission_id}"}).get("Item")
    if not item or item.get("itemType") != "SUBMISSION":
        raise JobError(404, "NOT_FOUND", "We couldn't find that submission.")
    return _plain(item)


def submission_detail(submission_id: str) -> dict:
    item = _require_submission(submission_id)
    name = _file_name(item)
    detail = {**item, "pdfUrl": _signed(item["pdfKey"], name, inline=True),
              "downloadUrl": _signed(item["pdfKey"], name)}
    if item.get("repositoryPdfKey"):
        detail["repositoryUrl"] = _signed(item["repositoryPdfKey"], _file_name(item, "-repository"))
    return detail


def decide(admin: User, submission_id: str, decision: str, note: str) -> dict:
    if decision not in (ACCEPTED, DECLINED):
        raise JobError(400, "INVALID_DECISION", "Choose accept or decline.")
    item = _require_submission(submission_id)
    if item["status"] != PENDING:
        raise JobError(409, "ALREADY_DECIDED", "This submission was already reviewed.")
    admin_note = _clean(note, 1000)
    now = now_iso()
    updates = {":status": decision, ":by": admin.display_name, ":now": now, ":note": admin_note,
               ":pending": PENDING}
    expression = "SET #s = :status, decidedBy = :by, decidedAt = :now, adminNote = :note"

    if decision == ACCEPTED:
        stored = json.loads(
            s3().get_object(Bucket=_bucket(), Key=item["contentKey"])["Body"].read()
        )
        data = report.ReportData(
            course_title=item["courseTitle"], course_code=item.get("courseCode", ""),
            revision=int(item["revision"]), reviewer_name=stored.get("reviewerName", ""),
            approved_at=item.get("approvedAt", ""), content=stored["content"],
            provenance=stored["provenance"], university_name=item["universityName"],
            admin_review={"reviewer": admin.display_name, "decided_at": now, "note": admin_note,
                          "submitted_by": item["ownerName"], "university": item["universityName"],
                          "submitted_at": item["createdAt"]},
        )
        prefix = f"repository/{item['universityId']}/{submission_id}"
        pdf_key = f"{prefix}/{_file_name(item)}"
        s3().put_object(Bucket=_bucket(), Key=pdf_key, Body=report.build_pdf(data),
                        ContentType="application/pdf")
        repository_note = {
            "submissionId": submission_id,
            "university": {"id": item["universityId"], "name": item["universityName"]},
            "submittedBy": item["ownerName"],
            "submittedAt": item["createdAt"],
            "course": {"code": item.get("courseCode", ""), "title": item["courseTitle"]},
            "approvedRevision": int(item["revision"]),
            "acceptedBy": admin.display_name,
            "acceptedAt": now,
            "adminNote": admin_note,
            "facultyNote": item.get("facultyNote", ""),
            "aiImpact": item.get("stats", {}),
            "changes": item.get("changes", []),
        }
        s3().put_object(Bucket=_bucket(), Key=f"{prefix}/note.json", ContentType="application/json",
                        Body=json.dumps(repository_note, indent=2).encode())
        expression += ", repositoryPdfKey = :pdf, repositoryNoteKey = :noteKey"
        updates.update({":pdf": pdf_key, ":noteKey": f"{prefix}/note.json"})

    try:
        _community().update_item(
            Key={"itemId": f"SUB#{submission_id}"}, UpdateExpression=expression,
            ConditionExpression="#s = :pending", ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues=updates,
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise JobError(409, "ALREADY_DECIDED", "This submission was already reviewed.") from exc
        raise
    audit.record("admin", f"REPOSITORY_{decision}", admin.user_id, submission_id)
    return submission_detail(submission_id)


# ---------------------------------------------------------------- feedback

def get_feedback(user: User, analysis_id: str) -> dict | None:
    item = _feedback().get_item(Key={"userId": user.user_id, "feedbackId": analysis_id}).get("Item")
    return _plain(item) if item else None


def save_feedback(user: User, analysis_id: str, experience: int, usefulness: int, comment: str) -> dict:
    university = _member(user)
    require_job(user.user_id, analysis_id)
    item = {
        "userId": user.user_id, "feedbackId": analysis_id, "universityId": university.id,
        "experienceRating": experience, "usefulnessRating": usefulness,
        "comment": _clean(comment, 2000), "updatedAt": now_iso(),
    }
    _feedback().put_item(Item=item)
    return item


# ---------------------------------------------------------------- admin views

def submissions_for(university_id: str) -> list[dict]:
    return _group(f"UNI#{university_id}")


def _average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def analytics() -> dict:
    submissions = _scan(_community(), FilterExpression=Attr("itemType").eq("SUBMISSION"))
    shares = _scan(_community(), FilterExpression=Attr("itemType").eq("SHARE"))
    feedback = _scan(_feedback())

    per_uni: dict[str, dict] = {}
    for u in universities.all_members():
        per_uni[u.id] = {**u.as_dict(), "submissions": 0, PENDING: 0, ACCEPTED: 0, DECLINED: 0,
                         "retained": [], "changed": [], "experience": [], "usefulness": [],
                         "shares": 0, "last_submission_at": ""}
    totals = Counter()
    items_total = Counter()
    by_month: dict[str, Counter] = defaultdict(Counter)
    for s in submissions:
        row = per_uni.get(s["universityId"])
        if not row:
            continue
        row["submissions"] += 1
        row[s["status"]] += 1
        row["last_submission_at"] = max(row["last_submission_at"], s["createdAt"])
        totals[s["status"]] += 1
        by_month[s["createdAt"][:7]][s["status"]] += 1
        stats = s.get("stats") or {}
        if "ai_text_retained_percent" in stats:
            row["retained"].append(stats["ai_text_retained_percent"])
            row["changed"].append(stats.get("faculty_changed_percent", 0))
        for kind in ("recommendations", "objectives"):
            for key in ("kept", "edited", "excluded"):
                items_total[key] += (stats.get(kind) or {}).get(key, 0)
    share_ids = set()
    for share in shares:
        row = per_uni.get(share.get("universityId", ""))
        if row and share["shareId"] not in share_ids:
            row["shares"] += 1
        share_ids.add(share["shareId"])
    for f in feedback:
        row = per_uni.get(f.get("universityId", ""))
        if row:
            row["experience"].append(f["experienceRating"])
            row["usefulness"].append(f["usefulnessRating"])

    rows = []
    for row in per_uni.values():
        rows.append({
            **{k: v for k, v in row.items() if k not in ("retained", "changed", "experience", "usefulness")},
            "avg_ai_retained_percent": _average(row["retained"]),
            "avg_faculty_changed_percent": _average(row["changed"]),
            "avg_experience": _average(row["experience"]),
            "avg_usefulness": _average(row["usefulness"]),
            "feedback_count": len(row["experience"]),
        })
    decided = totals[ACCEPTED] + totals[DECLINED]
    all_retained = [v for r in per_uni.values() for v in r["retained"]]
    recent = sorted(submissions, key=lambda s: s["createdAt"], reverse=True)[:6]
    return {
        "totals": {
            "submissions": len(submissions),
            "pending": totals[PENDING],
            "accepted": totals[ACCEPTED],
            "declined": totals[DECLINED],
            "acceptance_rate": round(totals[ACCEPTED] / decided * 100) if decided else None,
            "shares": len(share_ids),
            "feedback": len(feedback),
            "avg_experience": _average([f["experienceRating"] for f in feedback]),
            "avg_usefulness": _average([f["usefulnessRating"] for f in feedback]),
            "avg_ai_retained_percent": _average(all_retained),
            "universities_active": sum(1 for r in per_uni.values() if r["submissions"]),
        },
        "items": dict(items_total),
        "universities": rows,
        "by_month": [{"month": m, **{k.lower(): c[k] for k in (PENDING, ACCEPTED, DECLINED)}}
                     for m, c in sorted(by_month.items())],
        "recent": [_summary(s) for s in recent],
    }


def _summary(s: dict) -> dict:
    from app.course_context import label_term

    term = s.get("term", "")
    return {
        **{k: s.get(k) for k in (
            "submissionId", "status", "courseTitle", "courseCode", "ownerName", "universityId",
            "universityName", "createdAt", "decidedAt", "stats", "revision", "term",
            "gradeLevel", "courseFocus",
        )},
        "termLabel": label_term(term) if term else "",
    }


def summaries(items: list[dict]) -> list[dict]:
    return [_summary(s) for s in items]
