"""Faculty sharing, repository submissions, and feedback; ASPPH admin repository review."""

import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app import portal, universities
from app.auth import User, get_current_user, require_admin
from app.jobs import JobError

router = APIRouter(prefix="/api", tags=["portal"])

_CAMEL = re.compile(r"(?<=[a-z0-9])([A-Z])")


def _out(value):
    if isinstance(value, dict):
        return {
            (_CAMEL.sub(r"_\1", k).lower() if re.match(r"^[a-z][A-Za-z0-9]*$", k) else k): _out(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_out(v) for v in value]
    return value


def _call(fn, *args):
    try:
        return _out(fn(*args))
    except JobError as exc:
        raise HTTPException(exc.status, exc.message) from exc


class EmailShareRequest(BaseModel):
    emails: list[str] = Field(min_length=1, max_length=10)
    message: str = Field(default="", max_length=1000)


class SubmitRequest(BaseModel):
    note: str = Field(default="", max_length=1000)


class FeedbackRequest(BaseModel):
    experience_rating: int = Field(ge=1, le=5)
    usefulness_rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class DecisionRequest(BaseModel):
    decision: str = Field(pattern="^(ACCEPTED|DECLINED)$")
    note: str = Field(default="", max_length=1000)


# ---------------------------------------------------------------- faculty

@router.post("/analyses/{analysis_id}/shares/link", status_code=status.HTTP_201_CREATED)
def create_share_link(analysis_id: str, user: User = Depends(get_current_user)) -> dict:
    return _call(portal.create_link, user, analysis_id)


@router.post("/analyses/{analysis_id}/shares/email")
def share_by_email(
    analysis_id: str, request: EmailShareRequest, user: User = Depends(get_current_user)
) -> dict:
    results = _call(portal.share_by_email, user, analysis_id, request.emails, request.message)
    return {"shared": all(r["shared"] for r in results), "recipients": results}


@router.get("/shares")
def shared_with_me(user: User = Depends(get_current_user)) -> list[dict]:
    return _call(portal.inbox, user)


@router.get("/shares/{share_id}")
def open_share(share_id: str, user: User = Depends(get_current_user)) -> dict:
    return _call(portal.get_share, user, share_id)


@router.post("/analyses/{analysis_id}/submission", status_code=status.HTTP_201_CREATED)
def submit_to_repository(
    analysis_id: str, request: SubmitRequest, user: User = Depends(get_current_user)
) -> dict:
    return _call(portal.submit, user, analysis_id, request.note)


@router.get("/submissions")
def my_submissions(user: User = Depends(get_current_user)) -> list[dict]:
    return _call(portal.my_submissions, user)


@router.get("/analyses/{analysis_id}/feedback")
def get_feedback(analysis_id: str, user: User = Depends(get_current_user)) -> dict | None:
    return _call(portal.get_feedback, user, analysis_id)


@router.put("/analyses/{analysis_id}/feedback")
def save_feedback(
    analysis_id: str, request: FeedbackRequest, user: User = Depends(get_current_user)
) -> dict:
    return _call(
        portal.save_feedback, user, analysis_id, request.experience_rating,
        request.usefulness_rating, request.comment,
    )


# ---------------------------------------------------------------- admin

@router.get("/admin/analytics")
def analytics(_: User = Depends(require_admin)) -> dict:
    return _call(portal.analytics)


@router.get("/admin/universities/{university_id}/submissions")
def university_submissions(university_id: str, _: User = Depends(require_admin)) -> dict:
    university = universities.by_id(university_id)
    if not universities.is_member(university):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn't find that university.")
    items = portal.summaries(portal.submissions_for(university_id))
    return _out({"university": university.as_dict(), "submissions": items})


@router.get("/admin/university-options")
def university_options(_: User = Depends(require_admin)) -> dict:
    return {
        "institution_types": [
            {"id": key, "label": label} for key, label in universities.INSTITUTION_TYPES.items()
        ],
        "demo_password": universities.DEMO_FACULTY_PASSWORD,
        "demo_local_part": universities.DEMO_FACULTY_LOCAL,
    }


@router.post("/admin/universities", status_code=status.HTTP_201_CREATED)
async def create_university(
    admin: User = Depends(require_admin),
    name: str = Form(...),
    prefix: str = Form(...),
    city: str = Form(...),
    state: str = Form(...),
    zip_code: str = Form(""),
    institution_types: str = Form(""),
    guardrails_enabled: bool = Form(True),
    ai_policy: UploadFile | None = File(None),
) -> dict:
    """Register a member university and provision abc@{prefix}.edu for demos."""
    types = [t.strip() for t in institution_types.split(",") if t.strip()]
    policy_bytes: bytes | None = None
    policy_name = ""
    if ai_policy and ai_policy.filename:
        policy_bytes = await ai_policy.read()
        if len(policy_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "AI policy files must be 10 MB or smaller.")
        policy_name = ai_policy.filename
    try:
        university, demo_email = universities.create_university(
            actor_id=admin.user_id,
            name=name,
            prefix=prefix,
            city=city,
            state=state,
            zip_code=zip_code,
            institution_types=types,
            guardrails_enabled=guardrails_enabled,
            ai_policy_bytes=policy_bytes,
            ai_policy_file_name=policy_name,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except Exception as exc:
        # ConditionalCheckFailed or Cognito policy issues surface as clear messages.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Couldn't create the university: {exc}",
        ) from exc
    return _out(
        {
            "university": university.as_dict(),
            "demo_login": {
                "email": demo_email,
                "password": universities.DEMO_FACULTY_PASSWORD,
                "note": "Cognito requires a mixed password; use this demo password (not 123456).",
            },
        }
    )


@router.get("/admin/submissions/{submission_id}")
def submission_detail(submission_id: str, _: User = Depends(require_admin)) -> dict:
    return _call(portal.submission_detail, submission_id)


@router.post("/admin/submissions/{submission_id}/decision")
def decide(
    submission_id: str, request: DecisionRequest, admin: User = Depends(require_admin)
) -> dict:
    return _call(portal.decide, admin, submission_id, request.decision, request.note)
