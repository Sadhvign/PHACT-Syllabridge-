"""Member universities: seeded demo schools plus admin-created records in DynamoDB."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

from botocore.exceptions import ClientError

from app.aws import cognito, s3, table
from app.config import get_settings

ASPPH_ID = "aspph"

INSTITUTION_TYPES = {
    "NON_US": "Non-US Institution",
    "HBCU": "Historically Black College or University",
    "HSI": "Hispanic-Serving Institution",
    "TCU": "Tribal College or University",
    "FAITH_BASED": "Faith-Based Institution",
    "PBI": "Predominantly Black Institution",
    "OTHER_MSI": "Other Minority-Serving Institution",
}

# Cognito password policy rejects plain numeric passwords; this is the demo default.
DEMO_FACULTY_PASSWORD = "Demo1234!"
DEMO_FACULTY_LOCAL = "abc"


@dataclass(frozen=True)
class University:
    id: str
    name: str
    domain: str
    region: str
    city: str = ""
    state: str = ""
    zip_code: str = ""
    prefix: str = ""
    institution_types: tuple[str, ...] = ()
    ai_policy_key: str = ""
    ai_policy_file_name: str = ""
    guardrails_enabled: bool = True
    custom: bool = False

    def as_dict(self) -> dict:
        data = asdict(self)
        data["institution_types"] = list(self.institution_types)
        data["institution_type_labels"] = [
            INSTITUTION_TYPES[t] for t in self.institution_types if t in INSTITUTION_TYPES
        ]
        data["demo_email"] = f"{DEMO_FACULTY_LOCAL}@{self.domain}" if self.domain != "aspph.org" else ""
        return data


UNIVERSITIES: tuple[University, ...] = (
    University("xyz", "XYZ University School of Public Health", "xyz.edu", "Northeast", prefix="xyz"),
    University("abc", "ABC University College of Public Health", "abc.edu", "Southeast", prefix="abc"),
    University(
        "riverside",
        "Riverside University School of Public Health",
        "riverside.edu",
        "Midwest",
        prefix="riverside",
    ),
    University("lakeshore", "Lakeshore State University", "lakeshore.edu", "West", prefix="lakeshore"),
)

ASPPH = University(ASPPH_ID, "ASPPH (administrators)", "aspph.org", "", prefix="aspph")

_PREFIX_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$")


def _community():
    return table(get_settings().community_table)


def _bucket() -> str:
    return get_settings().community_bucket


def _item_id(university_id: str) -> str:
    return f"UNIREG#{university_id}"


def _from_item(item: dict) -> University:
    types = item.get("institutionTypes") or []
    if isinstance(types, str):
        types = [types]
    return University(
        id=item["universityId"],
        name=item.get("name", ""),
        domain=item.get("domain", ""),
        region=item.get("region") or item.get("state", ""),
        city=item.get("city", ""),
        state=item.get("state", ""),
        zip_code=item.get("zipCode", ""),
        prefix=item.get("prefix", ""),
        institution_types=tuple(t for t in types if t in INSTITUTION_TYPES),
        ai_policy_key=item.get("aiPolicyKey", ""),
        ai_policy_file_name=item.get("aiPolicyFileName", ""),
        guardrails_enabled=bool(item.get("guardrailsEnabled", True)),
        custom=True,
    )


def _load_custom() -> list[University]:
    items: list[University] = []
    try:
        kwargs: dict = {
            "FilterExpression": "itemType = :t",
            "ExpressionAttributeValues": {":t": "UNIVERSITY"},
        }
        while True:
            page = _community().scan(**kwargs)
            for raw in page.get("Items", []):
                if raw.get("universityId"):
                    items.append(_from_item(raw))
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    except ClientError:
        return []
    return items


def all_members() -> tuple[University, ...]:
    """Seeded members plus admin-created universities (excludes ASPPH)."""
    custom = _load_custom()
    seeded_ids = {u.id for u in UNIVERSITIES}
    extras = [u for u in custom if u.id not in seeded_ids]
    return tuple([*UNIVERSITIES, *extras])


def all_for_login() -> tuple[University, ...]:
    return (*all_members(), ASPPH)


def by_id(university_id: str) -> University | None:
    if university_id == ASPPH_ID:
        return ASPPH
    for u in all_members():
        if u.id == university_id:
            return u
    return None


def for_email(email: str) -> University | None:
    """Membership comes from the verified email domain, never from client input."""
    domain = email.rsplit("@", 1)[-1].strip().lower() if "@" in email else ""
    if not domain:
        return None
    for u in all_for_login():
        if u.domain == domain:
            return u
    return None


def is_member(university: University | None) -> bool:
    return university is not None and university.id != ASPPH_ID


def normalize_prefix(prefix: str) -> str:
    value = (prefix or "").strip().lower().replace(" ", "").replace("_", "-")
    if value.endswith(".edu"):
        value = value[:-4]
    return value


def validate_create(
    *,
    name: str,
    prefix: str,
    city: str,
    state: str,
    zip_code: str,
    institution_types: list[str],
) -> tuple[str, str, list[str]]:
    name = (name or "").strip()
    if len(name) < 3:
        raise ValueError("Enter the university name.")
    pref = normalize_prefix(prefix)
    if not _PREFIX_RE.match(pref):
        raise ValueError(
            "Prefix must be a short lowercase domain label (letters, numbers, hyphens), e.g. gwu."
        )
    domain = f"{pref}.edu"
    if any(u.domain == domain or u.id == pref or u.prefix == pref for u in all_for_login()):
        raise ValueError(f"A university with prefix '{pref}' already exists.")
    city = (city or "").strip()
    state = (state or "").strip().upper()
    zip_code = (zip_code or "").strip()
    if not city or not state:
        raise ValueError("City and state are required.")
    types = [t for t in institution_types if t in INSTITUTION_TYPES]
    return name, pref, types


def create_university(
    *,
    actor_id: str,
    name: str,
    prefix: str,
    city: str,
    state: str,
    zip_code: str,
    institution_types: list[str],
    guardrails_enabled: bool,
    ai_policy_bytes: bytes | None = None,
    ai_policy_file_name: str = "",
) -> tuple[University, str]:
    """Persist a university and provision abc@{prefix}.edu with the demo password."""
    from datetime import UTC, datetime

    clean_name, pref, types = validate_create(
        name=name,
        prefix=prefix,
        city=city,
        state=state,
        zip_code=zip_code,
        institution_types=institution_types,
    )
    domain = f"{pref}.edu"
    university_id = pref
    policy_key = ""
    policy_name = ""
    if ai_policy_bytes and ai_policy_file_name:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "-", ai_policy_file_name).strip("-.") or "ai-policy.pdf"
        policy_key = f"universities/{university_id}/{safe}"
        s3().put_object(
            Bucket=_bucket(),
            Key=policy_key,
            Body=ai_policy_bytes,
            ContentType="application/pdf"
            if safe.lower().endswith(".pdf")
            else "application/octet-stream",
        )
        policy_name = safe

    now = datetime.now(UTC).isoformat()
    item = {
        "itemId": _item_id(university_id),
        "itemType": "UNIVERSITY",
        "universityId": university_id,
        "name": clean_name,
        "domain": domain,
        "prefix": pref,
        "city": city.strip(),
        "state": state.strip().upper()[:2] if len(state.strip()) <= 2 else state.strip()[:40],
        "zipCode": zip_code.strip()[:20],
        "region": state.strip().upper()[:2] if len(state.strip()) == 2 else state.strip()[:40],
        "institutionTypes": types,
        "aiPolicyKey": policy_key,
        "aiPolicyFileName": policy_name,
        "guardrailsEnabled": bool(guardrails_enabled),
        "createdBy": actor_id,
        "createdAt": now,
        "updatedAt": now,
        "groupKey": "UNIVERSITIES",
    }
    _community().put_item(
        Item=item,
        ConditionExpression="attribute_not_exists(itemId)",
    )
    university = _from_item(item)
    demo_email = provision_demo_faculty(university)
    return university, demo_email


def provision_demo_faculty(university: University) -> str:
    """Create or reset abc@{domain} in Cognito for hackathon demos."""
    settings = get_settings()
    email = f"{DEMO_FACULTY_LOCAL}@{university.domain}"
    attributes = [
        {"Name": "email", "Value": email},
        {"Name": "email_verified", "Value": "true"},
        {"Name": "given_name", "Value": "Demo"},
        {"Name": "family_name", "Value": "Faculty"},
        {"Name": "custom:institution", "Value": university.name},
    ]
    client = cognito()
    pool_id = settings.user_pool_id
    try:
        client.admin_create_user(
            UserPoolId=pool_id,
            Username=email,
            UserAttributes=attributes,
            MessageAction="SUPPRESS",
        )
    except client.exceptions.UsernameExistsException:
        client.admin_update_user_attributes(
            UserPoolId=pool_id,
            Username=email,
            UserAttributes=attributes,
        )
    client.admin_set_user_password(
        UserPoolId=pool_id,
        Username=email,
        Password=DEMO_FACULTY_PASSWORD,
        Permanent=True,
    )
    try:
        client.admin_add_user_to_group(
            UserPoolId=pool_id,
            Username=email,
            GroupName="faculty",
        )
    except ClientError:
        pass
    return email
