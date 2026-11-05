import os, subprocess, sys
from pathlib import Path
from dotenv import load_dotenv

for k in list(os.environ):
    if k.startswith("AWS_") or k.startswith("OTEL_") or k == "AGENT_OBSERVABILITY_ENABLED":
        del os.environ[k]
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ["AGENT_OBSERVABILITY_ENABLED"] = "true"
os.environ["OTEL_PYTHON_DISTRO"] = "aws_distro"
os.environ["OTEL_PYTHON_CONFIGURATOR"] = "aws_configurator"
os.environ["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf"
os.environ["OTEL_RESOURCE_ATTRIBUTES"] = "service.name=phact-recommendations"
headers = (
    "x-aws-log-group=/aws/bedrock-agentcore/phact-recommendations,"
    "x-aws-log-stream=local-dev,"
    "x-aws-metric-namespace=bedrock-agentcore"
)
os.environ["OTEL_EXPORTER_OTLP_LOGS_HEADERS"] = headers
os.environ["OTEL_EXPORTER_OTLP_TRACES_HEADERS"] = headers

instrument = Path(sys.executable).with_name("opentelemetry-instrument.exe")
cmd = [
    str(instrument),
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
]
raise SystemExit(subprocess.call(cmd, env=os.environ))
