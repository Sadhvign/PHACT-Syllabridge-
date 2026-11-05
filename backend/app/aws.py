from functools import lru_cache

import boto3
from botocore.config import Config

from app.config import get_settings


def _client(service: str, **config):
    return boto3.client(
        service,
        region_name=get_settings().aws_region,
        config=Config(retries={"max_attempts": 4, "mode": "adaptive"}, **config),
    )


@lru_cache
def dynamodb():
    return boto3.resource("dynamodb", region_name=get_settings().aws_region)


def table(name: str):
    return dynamodb().Table(name)


@lru_cache
def s3():
    # KMS-encrypted buckets require SigV4 presigned URLs.
    return _client("s3", signature_version="s3v4")


@lru_cache
def bedrock_runtime():
    return _client("bedrock-runtime", connect_timeout=5, read_timeout=180)


@lru_cache
def bedrock_agent_runtime():
    return _client("bedrock-agent-runtime", connect_timeout=5, read_timeout=30)


@lru_cache
def bedrock_agent():
    return _client("bedrock-agent")


@lru_cache
def comprehend():
    return _client("comprehend")


@lru_cache
def cognito():
    return _client("cognito-idp")
