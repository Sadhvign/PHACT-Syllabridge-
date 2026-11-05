"""Safe structured logging and CloudWatch EMF metrics for PHACT.

Never log syllabus text, prompts, model completions, Comprehend entities,
Guardrail assessments, or other AI-restricted content. Callers must only pass
identifiers, codes, counts, and durations.
"""

from __future__ import annotations

import json
import logging
import re
import sys
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, Iterator

from app.config import get_settings

METRIC_NAMESPACE = "PHACT"
SERVICE_NAME = "phact-api"

# Keys that must never appear in structured logs (case-insensitive match on leaf keys).
_FORBIDDEN_KEY_RE = re.compile(
    r"^(text|prompt|syllabus|body|content|message|messages|input|output|completion|"
    r"assessments|entities|scrubbed_text|scrubbed|raw|password|token|authorization|"
    r"secret|ssn|email_body|file_bytes|transcript)$",
    re.I,
)

_request_id: ContextVar[str] = ContextVar("phact_request_id", default="")

log = logging.getLogger("phact.observability")


def get_request_id() -> str:
    return _request_id.get() or ""


def set_request_id(value: str | None = None) -> str:
    rid = value or uuid.uuid4().hex[:12]
    _request_id.set(rid)
    return rid


def _is_forbidden_key(key: str) -> bool:
    return bool(_FORBIDDEN_KEY_RE.match(key.replace("-", "_")))


def sanitize_fields(fields: dict[str, Any]) -> dict[str, Any]:
    """Drop forbidden keys and coerce values to JSON-safe scalars/lists of scalars."""
    clean: dict[str, Any] = {}
    for key, value in fields.items():
        if _is_forbidden_key(str(key)):
            continue
        if value is None or isinstance(value, (bool, int, float)):
            clean[key] = value
        elif isinstance(value, str):
            # Identifiers/codes only — truncate aggressively if a caller slips.
            clean[key] = value[:120]
        elif isinstance(value, dict):
            # Only allow flat count maps like redactions={"EMAIL": 2}.
            nested = {}
            for nk, nv in value.items():
                if _is_forbidden_key(str(nk)):
                    continue
                if isinstance(nv, (int, float, bool)) or nv is None:
                    nested[str(nk)[:40]] = nv
                elif isinstance(nv, str):
                    nested[str(nk)[:40]] = nv[:40]
            if nested:
                clean[key] = nested
        elif isinstance(value, (list, tuple)):
            items = []
            for item in value[:20]:
                if isinstance(item, (bool, int, float)):
                    items.append(item)
                elif isinstance(item, str):
                    items.append(item[:60])
            clean[key] = items
        else:
            clean[key] = type(value).__name__
    return clean


class JsonFormatter(logging.Formatter):
    """One JSON object per line for CloudWatch Logs Insights."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage()[:500],
            "service": SERVICE_NAME,
        }
        rid = get_request_id()
        if rid:
            payload["request_id"] = rid
        extras = getattr(record, "phact_fields", None)
        if isinstance(extras, dict):
            payload.update(sanitize_fields(extras))
        if record.exc_info:
            # Exception type/message only — no full traceback dump of request bodies.
            exc_type = record.exc_info[0]
            exc = record.exc_info[1]
            payload["error_type"] = getattr(exc_type, "__name__", "Exception")
            payload["error"] = str(exc)[:200] if exc else ""
        return json.dumps(payload, default=str, separators=(",", ":"))


def configure_logging(level: int = logging.INFO) -> None:
    """Install JSON logging on the root phact loggers (idempotent)."""
    root = logging.getLogger("phact")
    if any(isinstance(h, logging.StreamHandler) and isinstance(h.formatter, JsonFormatter) for h in root.handlers):
        root.setLevel(level)
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    root.propagate = False
    # Also format uvicorn access lightly without bodies.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv = logging.getLogger(name)
        uv.handlers.clear()
        uv.addHandler(handler)
        uv.setLevel(level)
        uv.propagate = False


def emit(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    """Log a structured event with an allowlisted field set."""
    record = logger.makeRecord(
        logger.name,
        level,
        "(observability)",
        0,
        event,
        args=(),
        exc_info=None,
    )
    record.phact_fields = {"event": event, **sanitize_fields(fields)}
    logger.handle(record)


def info(logger: logging.Logger, event: str, **fields: Any) -> None:
    emit(logger, logging.INFO, event, **fields)


def warning(logger: logging.Logger, event: str, **fields: Any) -> None:
    emit(logger, logging.WARNING, event, **fields)


def error(logger: logging.Logger, event: str, **fields: Any) -> None:
    emit(logger, logging.ERROR, event, **fields)


def metric(
    name: str,
    value: float = 1.0,
    *,
    unit: str = "Count",
    dimensions: dict[str, str] | None = None,
) -> None:
    """Emit CloudWatch Embedded Metric Format to stdout (picked up by Logs)."""
    # Keep dimension cardinality low — codes/statuses only. No Stage auto-dim so
    # alarms can match metrics without fighting local vs deployed splits.
    safe_dims = {
        str(k)[:40]: str(v)[:60]
        for k, v in (dimensions or {}).items()
        if not _is_forbidden_key(str(k))
    }
    dim_keys = list(safe_dims.keys())
    payload = {
        "_aws": {
            "Timestamp": int(time.time() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": METRIC_NAMESPACE,
                    "Dimensions": [dim_keys],
                    "Metrics": [{"Name": name, "Unit": unit}],
                }
            ],
        },
        **safe_dims,
        name: value,
        "service": SERVICE_NAME,
        "request_id": get_request_id(),
        "local_worker": bool(get_settings().local_worker),
    }
    # EMF must be a single-line JSON object on stdout.
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


@contextmanager
def timed(metric_name: str, **dimensions: str) -> Iterator[dict[str, float]]:
    """Context manager that records duration_ms and emits a timing metric."""
    box: dict[str, float] = {"duration_ms": 0.0}
    start = time.perf_counter()
    try:
        yield box
    finally:
        box["duration_ms"] = round((time.perf_counter() - start) * 1000, 1)
        metric(metric_name, box["duration_ms"], unit="Milliseconds", dimensions=dimensions)


def check_dependencies() -> dict[str, Any]:
    """Lightweight dependency probe for /health — never sends user content."""
    settings = get_settings()
    checks: dict[str, Any] = {
        "api": "ok",
        "config": {
            "guardrail_configured": bool(settings.guardrail_id),
            "guardrail_version": (settings.guardrail_version or "")[:32],
            "knowledge_base_configured": bool(settings.knowledge_base_id),
            "local_worker": bool(settings.local_worker),
        },
    }
    try:
        from app.aws import dynamodb, s3

        if settings.analyses_table:
            dynamodb().meta.client.describe_table(TableName=settings.analyses_table)
            checks["dynamodb"] = "ok"
        else:
            checks["dynamodb"] = "unconfigured"
        if settings.uploads_bucket:
            s3().head_bucket(Bucket=settings.uploads_bucket)
            checks["s3"] = "ok"
        else:
            checks["s3"] = "unconfigured"
    except Exception as exc:  # noqa: BLE001 — health must stay up
        checks["aws"] = "degraded"
        checks["aws_error_type"] = type(exc).__name__
    checks["status"] = (
        "ok"
        if checks.get("dynamodb") in ("ok", "unconfigured")
        and checks.get("s3") in ("ok", "unconfigured")
        and checks.get("aws") != "degraded"
        else "degraded"
    )
    return checks
