"""Report which AWS services the configured credentials can use.

Prints only service names and AWS error codes, never credential values.
"""

import json
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

session = boto3.Session(region_name="us-east-1")
identity = session.client("sts").get_caller_identity()
print("account", identity["Account"])
print("role", identity["Arn"].split("/")[1])


def check(name, call):
    try:
        call()
        print(f"{name:24} OK")
    except ClientError as exc:
        print(f"{name:24} {exc.response['Error']['Code']}")


check("cloudformation", lambda: session.client("cloudformation").list_stacks())
check("iam:list-roles", lambda: session.client("iam").list_roles(MaxItems=1))
check("cognito", lambda: session.client("cognito-idp").list_user_pools(MaxResults=1))
check("dynamodb", lambda: session.client("dynamodb").list_tables(Limit=1))
check("s3", lambda: session.client("s3").list_buckets())
check(
    "knowledge-bases",
    lambda: session.client("bedrock-agent").list_knowledge_bases(maxResults=1),
)
check("guardrails", lambda: session.client("bedrock").list_guardrails(maxResults=1))
check(
    "s3vectors",
    lambda: session.client("s3vectors").list_vector_buckets(maxResults=1),
)
check(
    "comprehend-pii",
    lambda: session.client("comprehend").detect_pii_entities(
        Text="Jane Doe jane@example.com", LanguageCode="en"
    ),
)
check(
    "titan-embeddings",
    lambda: session.client("bedrock-runtime").invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=json.dumps({"inputText": "hello"}),
    ),
)
check(
    "cdk-bootstrap",
    lambda: session.client("ssm").get_parameter(
        Name="/cdk-bootstrap/hnb659fds/version"
    ),
)
