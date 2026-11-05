from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import universities
from app.auth import User, get_current_user

router = APIRouter(prefix="/api", tags=["profile"])


class UniversityView(BaseModel):
    id: str
    name: str
    domain: str
    region: str
    city: str = ""
    state: str = ""
    zip_code: str = ""
    prefix: str = ""
    institution_types: list[str] = []
    institution_type_labels: list[str] = []
    guardrails_enabled: bool = True
    custom: bool = False
    demo_email: str = ""


class Profile(BaseModel):
    user_id: str
    email: str
    display_name: str
    given_name: str
    institution: str
    university: UniversityView
    groups: list[str]
    is_admin: bool


@router.get("/universities", response_model=list[UniversityView])
def list_universities() -> list[UniversityView]:
    """Public: the sign-in page lists these before anyone is authenticated."""
    return [UniversityView(**u.as_dict()) for u in universities.all_for_login()]


@router.get("/me", response_model=Profile)
def me(user: User = Depends(get_current_user)) -> Profile:
    university = user.university
    assert university is not None  # get_current_user rejects unlisted domains
    return Profile(
        user_id=user.user_id,
        email=user.email,
        display_name=user.display_name,
        given_name=user.given_name,
        institution=university.name,
        university=UniversityView(**university.as_dict()),
        groups=list(user.groups),
        is_admin=user.is_admin,
    )
