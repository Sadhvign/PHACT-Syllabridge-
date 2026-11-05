import logging
import uuid
from datetime import UTC, datetime

from app import observability
from app.aws import table
from app.config import get_settings

log = logging.getLogger("phact.audit")


def record(scope: str, action: str, actor_id: str, target: str, **details: str | int) -> None:
    """Store an audit event. Callers pass identifiers and codes only, never user content."""
    now = datetime.now(UTC).isoformat()
    safe_details = observability.sanitize_fields(dict(details))
    item = {
        "scope": scope,
        "eventId": f"{now}#{uuid.uuid4().hex[:8]}",
        "action": action,
        "actorId": actor_id,
        "target": target,
        "at": now,
        **safe_details,
    }
    table(get_settings().audit_table).put_item(Item=item)
    observability.info(
        log,
        "audit_event",
        scope=scope,
        action=action,
        target=target,
        actor_id=actor_id,
        **safe_details,
    )
    observability.metric("AuditEvent", 1, dimensions={"Action": str(action)[:60]})
