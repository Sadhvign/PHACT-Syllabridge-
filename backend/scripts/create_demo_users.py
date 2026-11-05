"""Create (or reset) the PHACT demo users in Cognito.

Cognito emails are suppressed, so example addresses work. Generated passwords are
written to demo-users.local.txt at the repository root, which git ignores.
"""

import secrets
import string
from pathlib import Path

import boto3

from app import universities
from app.config import get_settings

# previous_email migrates an earlier demo account in place, keeping its user ID and data.
DEMO_USERS = [
    {"email": "elena.marchetti@xyz.edu", "previous_email": "faculty@phact.example",
     "given_name": "Elena", "family_name": "Marchetti", "group": "faculty"},
    {"email": "marcus.lee@xyz.edu", "given_name": "Marcus", "family_name": "Lee",
     "group": "faculty"},
    {"email": "priya.shah@abc.edu", "given_name": "Priya", "family_name": "Shah",
     "group": "faculty"},
    {"email": "daniel.okafor@riverside.edu", "given_name": "Daniel", "family_name": "Okafor",
     "group": "faculty"},
    {"email": "grace.kim@lakeshore.edu", "given_name": "Grace", "family_name": "Kim",
     "group": "faculty"},
    {"email": "jordan.reyes@aspph.org", "previous_email": "admin@phact.example",
     "given_name": "Jordan", "family_name": "Reyes", "group": "aspph-admin"},
]


def generate_password() -> str:
    alphabet = string.ascii_letters + string.digits
    body = "".join(secrets.choice(alphabet) for _ in range(14))
    # Guarantee every character class the pool's password policy requires.
    return f"Ph{body}7!a"


def main() -> None:
    settings = get_settings()
    cognito = boto3.client("cognito-idp", region_name=settings.aws_region)
    pool_id = settings.user_pool_id
    lines = []

    for user in DEMO_USERS:
        university = universities.for_email(user["email"])
        assert university, f"{user['email']} is not on a listed university domain"
        attributes = [
            {"Name": "email", "Value": user["email"]},
            {"Name": "email_verified", "Value": "true"},
            {"Name": "given_name", "Value": user["given_name"]},
            {"Name": "family_name", "Value": user["family_name"]},
            {"Name": "custom:institution", "Value": university.name},
        ]
        previous = user.get("previous_email")
        if previous:
            try:
                cognito.admin_update_user_attributes(
                    UserPoolId=pool_id, Username=previous, UserAttributes=attributes
                )
                print(f"Migrated {previous} -> {user['email']}")
            except cognito.exceptions.UserNotFoundException:
                pass
        try:
            cognito.admin_create_user(
                UserPoolId=pool_id,
                Username=user["email"],
                UserAttributes=attributes,
                MessageAction="SUPPRESS",
            )
        except cognito.exceptions.UsernameExistsException:
            cognito.admin_update_user_attributes(
                UserPoolId=pool_id,
                Username=user["email"],
                UserAttributes=attributes,
            )

        password = generate_password()
        cognito.admin_set_user_password(
            UserPoolId=pool_id,
            Username=user["email"],
            Password=password,
            Permanent=True,
        )
        cognito.admin_add_user_to_group(
            UserPoolId=pool_id,
            Username=user["email"],
            GroupName=user["group"],
        )
        lines.append(f"{university.name:46} {user['email']:30} {password}")
        print(f"Ready: {user['email']} ({user['group']})")

    target = Path(__file__).resolve().parents[2] / "demo-users.local.txt"
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Passwords written to {target}")


if __name__ == "__main__":
    main()
