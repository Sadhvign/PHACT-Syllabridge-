from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import universities
from app.config import get_settings
from app.universities import University

FACULTY_GROUP = "faculty"
ADMIN_GROUP = "aspph-admin"

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class User:
    user_id: str
    email: str
    given_name: str
    family_name: str
    institution: str
    groups: tuple[str, ...]

    @property
    def university(self) -> University | None:
        return universities.for_email(self.email)

    @property
    def is_admin(self) -> bool:
        university = self.university
        return ADMIN_GROUP in self.groups and university is not None and university.id == universities.ASPPH_ID

    @property
    def display_name(self) -> str:
        return f"{self.given_name} {self.family_name}".strip() or self.email


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    settings = get_settings()
    return jwt.PyJWKClient(
        f"{settings.cognito_issuer}/.well-known/jwks.json",
        cache_keys=True,
    )


def _decode_id_token(token: str) -> dict:
    settings = get_settings()
    signing_key = _jwks_client().get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.user_pool_client_id,
        issuer=settings.cognito_issuer,
        options={"require": ["exp", "iat", "sub", "token_use"]},
    )
    if claims.get("token_use") != "id":
        raise jwt.InvalidTokenError("Expected an ID token")
    return claims


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in to continue.",
        )
    try:
        claims = _decode_id_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
        ) from exc

    user = User(
        user_id=claims["sub"],
        email=claims.get("email", "").lower(),
        given_name=claims.get("given_name", ""),
        family_name=claims.get("family_name", ""),
        institution=claims.get("custom:institution", ""),
        groups=tuple(claims.get("cognito:groups", [])),
    )
    if claims.get("email_verified") not in (True, "true") or not (
        user.is_admin or universities.is_member(user.university)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account isn't linked to a PHACT member university. Contact ASPPH.",
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This area is limited to ASPPH administrators. "
                "Contact ASPPH if you need access to knowledge-source management."
            ),
        )
    return user
