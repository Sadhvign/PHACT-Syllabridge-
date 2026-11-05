import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
CDK_OUTPUTS_FILE = BACKEND_DIR.parent / "infra" / "cdk-outputs.json"

# CDK output name -> environment variable read by Settings.
OUTPUT_ENV_NAMES = {
    "UserPoolId": "USER_POOL_ID",
    "UserPoolClientId": "USER_POOL_CLIENT_ID",
    "DataKeyArn": "DATA_KEY_ARN",
    "KnowledgeBucketName": "KNOWLEDGE_BUCKET",
    "UploadsBucketName": "UPLOADS_BUCKET",
    "ExportsBucketName": "EXPORTS_BUCKET",
    "CommunityBucketName": "COMMUNITY_BUCKET",
    "SyllabiTableName": "SYLLABI_TABLE",
    "AnalysesTableName": "ANALYSES_TABLE",
    "SourcesTableName": "SOURCES_TABLE",
    "CommunityTableName": "COMMUNITY_TABLE",
    "FeedbackTableName": "FEEDBACK_TABLE",
    "AuditTableName": "AUDIT_TABLE",
    "KnowledgeBaseId": "KNOWLEDGE_BASE_ID",
    "KnowledgeDataSourceId": "KNOWLEDGE_DATA_SOURCE_ID",
    "GuardrailId": "GUARDRAIL_ID",
    "GuardrailVersion": "GUARDRAIL_VERSION",
}


def _load_local_environment() -> None:
    """Populate environment variables for local development.

    Local `.env` wins over any AWS_* values inherited from the shell (stale session
    tokens were shadowing a fresh .env and breaking DynamoDB calls). Deployed Lambdas
    have no .env file; CDK stack outputs still use setdefault so real env wins there.
    """
    load_dotenv(BACKEND_DIR / ".env", override=True)
    if not CDK_OUTPUTS_FILE.exists():
        return
    stacks = json.loads(CDK_OUTPUTS_FILE.read_text(encoding="utf-8"))
    for outputs in stacks.values():
        for output_name, value in outputs.items():
            env_name = OUTPUT_ENV_NAMES.get(output_name)
            if env_name:
                os.environ.setdefault(env_name, str(value))


class Settings(BaseSettings):
    aws_region: str = "us-east-1"
    bedrock_model_id: str = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    user_pool_id: str = ""
    user_pool_client_id: str = ""
    data_key_arn: str = ""

    knowledge_bucket: str = ""
    uploads_bucket: str = ""
    exports_bucket: str = ""
    community_bucket: str = ""

    syllabi_table: str = ""
    analyses_table: str = ""
    sources_table: str = ""
    community_table: str = ""
    feedback_table: str = ""
    audit_table: str = ""

    knowledge_base_id: str = ""
    knowledge_data_source_id: str = ""
    guardrail_id: str = ""
    guardrail_version: str = "DRAFT"

    # Server-side limits for analysis jobs.
    analysis_max_input_chars: int = 60_000
    analysis_deadline_seconds: int = 360
    analysis_agent_timeout_seconds: int = 210
    analysis_max_attempts: int = 3
    # Faculty-driven refine-until-accept loops (separate from automatic failure retries).
    analysis_max_refines: int = 8
    scrubbed_input_retention_days: int = 30
    export_link_ttl_seconds: int = 300

    # Runs the job worker and schedulers inside the API process for local development.
    # Deployed environments use the worker Lambda and EventBridge Scheduler instead.
    local_worker: bool = True

    model_config = SettingsConfigDict(extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def cognito_issuer(self) -> str:
        return f"https://cognito-idp.{self.aws_region}.amazonaws.com/{self.user_pool_id}"


@lru_cache
def get_settings() -> Settings:
    _load_local_environment()
    return Settings()
