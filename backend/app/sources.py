"""Approved knowledge-source inventory, Knowledge Base synchronization, and eligible retrieval.

The sources table is the authority on which source versions may ground a recommendation.
The vector index catches up asynchronously, so every retrieval result is re-checked here.
"""

import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import PurePath

from botocore.exceptions import ClientError

from app import audit
from app.aws import bedrock_agent, bedrock_agent_runtime, s3, table
from app.config import get_settings

log = logging.getLogger("phact.sources")

SOURCES_PREFIX = "sources/"
STAGING_PREFIX = "staging/"
SYNC_STATE_ID = "__sync__"
RUN_PREFIX = "__run__#"

ACTIVE = "ACTIVE"
RETIRED = "RETIRED"

PENDING = "PENDING"
SYNCING = "SYNCING"
SYNCED = "SYNCED"
FAILED = "FAILED"

RUNNING_JOB_STATES = {"STARTING", "IN_PROGRESS", "STOPPING"}
FAILED_DOCUMENT_STATES = {
    "FAILED",
    "PARTIALLY_INDEXED",
    "METADATA_PARTIALLY_INDEXED",
    "METADATA_UPDATE_FAILED",
}
STALE_CLAIM = timedelta(minutes=2)
EXCERPT_CHARS = 700

CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
}


class SourceConflict(Exception):
    """The source changed since the caller last read it."""


@dataclass
class Evidence:
    ref: str
    source_id: str
    version: int
    title: str
    source_type: str
    excerpt: str
    score: float

    def as_dict(self) -> dict:
        return {
            "ref": self.ref,
            "source_id": self.source_id,
            "version": self.version,
            "title": self.title,
            "source_type": self.source_type,
            "excerpt": self.excerpt,
        }


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _table():
    return table(get_settings().sources_table)


def _bucket() -> str:
    return get_settings().knowledge_bucket


def _kb_ids() -> dict:
    settings = get_settings()
    return {
        "knowledgeBaseId": settings.knowledge_base_id,
        "dataSourceId": settings.knowledge_data_source_id,
    }


def safe_file_name(name: str) -> str:
    name = PurePath(name.replace("\\", "/")).name
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", PurePath(name).stem).strip("-.") or "document"
    return f"{stem[:80]}{PurePath(name).suffix.lower()}"


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "source"
    return f"{slug}-{uuid.uuid4().hex[:6]}"


# ---------- Inventory ----------


def list_sources() -> list[dict]:
    items: list[dict] = []
    kwargs: dict = {}
    while True:
        page = _table().scan(**kwargs)
        items.extend(i for i in page.get("Items", []) if not i["sourceId"].startswith("__"))
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def get_source(source_id: str) -> dict | None:
    return _table().get_item(Key={"sourceId": source_id}).get("Item")


def _object_prefix(source_id: str) -> str:
    return f"{SOURCES_PREFIX}{source_id}/"


def _delete_objects(prefix: str, keep: set[str] = frozenset()) -> None:
    paginator = s3().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=_bucket(), Prefix=prefix):
        objects = [{"Key": o["Key"]} for o in page.get("Contents", []) if o["Key"] not in keep]
        if objects:
            s3().delete_objects(Bucket=_bucket(), Delete={"Objects": objects, "Quiet": True})


def _write_document(source_id: str, version: int, meta: dict, file_name: str, body: bytes) -> str:
    key = f"{_object_prefix(source_id)}v{version}/{safe_file_name(file_name)}"
    content_type = CONTENT_TYPES.get(PurePath(key).suffix, "application/octet-stream")
    s3().put_object(Bucket=_bucket(), Key=key, Body=body, ContentType=content_type)
    metadata = {
        "metadataAttributes": {
            "sourceId": source_id,
            "version": version,
            "title": meta["title"],
            "sourceType": meta["sourceType"],
        }
    }
    s3().put_object(
        Bucket=_bucket(),
        Key=f"{key}.metadata.json",
        Body=json.dumps(metadata).encode("utf-8"),
        ContentType="application/json",
    )
    return key


def staging_key(admin_id: str, upload_id: str, file_name: str) -> str:
    return f"{STAGING_PREFIX}{admin_id}/{upload_id}/{safe_file_name(file_name)}"


def read_staged(admin_id: str, upload_id: str, file_name: str) -> bytes:
    key = staging_key(admin_id, upload_id, file_name)
    return s3().get_object(Bucket=_bucket(), Key=key)["Body"].read()


def discard_staged(admin_id: str, upload_id: str) -> None:
    _delete_objects(f"{STAGING_PREFIX}{admin_id}/{upload_id}/")


def publish(
    *,
    actor_id: str,
    meta: dict,
    file_name: str,
    body: bytes,
    source_id: str | None = None,
    expected_version: int | None = None,
) -> dict:
    """Create a source or publish a new version of it. Superseded versions stop being
    eligible for retrieval immediately, before the index is re-synced."""
    creating = expected_version is None
    source_id = source_id or slugify(meta["title"])
    version = 1 if creating else (expected_version or 0) + 1
    key = _write_document(source_id, version, meta, file_name, body)
    now = _now()
    values = {
        "title": meta["title"],
        "sourceType": meta["sourceType"],
        "owner": meta["owner"],
        "effectiveDate": meta.get("effectiveDate") or "",
        "governanceStatus": ACTIVE,
        "version": version,
        "s3Key": key,
        "fileName": safe_file_name(file_name),
        "syncStatus": PENDING,
        "syncMessage": "",
        "updatedAt": now,
        "updatedBy": actor_id,
    }
    names = {f"#{k}": k for k in values}
    expression = "SET " + ", ".join(f"#{k} = :{k}" for k in values)
    attr_values = {f":{k}": v for k, v in values.items()}
    if creating:
        condition = "attribute_not_exists(sourceId)"
        expression += ", createdAt = :createdAt"
        attr_values[":createdAt"] = now
    else:
        condition = "#version = :expected AND governanceStatus = :active"
        attr_values[":expected"] = expected_version
        attr_values[":active"] = ACTIVE
    try:
        item = _table().update_item(
            Key={"sourceId": source_id},
            UpdateExpression=expression,
            ConditionExpression=condition,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=attr_values,
            ReturnValues="ALL_NEW",
        )["Attributes"]
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            _delete_objects(f"{_object_prefix(source_id)}v{version}/")
            raise SourceConflict from exc
        raise
    # Earlier versions leave S3 so the next sync removes their vectors.
    _delete_objects(_object_prefix(source_id), keep={key, f"{key}.metadata.json"})
    audit.record(
        "sources",
        "SOURCE_CREATED" if creating else "SOURCE_UPDATED",
        actor_id,
        source_id,
        version=version,
    )
    return item


def retire(source_id: str, actor_id: str, expected_version: int) -> dict:
    try:
        item = _table().update_item(
            Key={"sourceId": source_id},
            UpdateExpression="SET governanceStatus = :retired, syncStatus = :pending, "
            "syncMessage = :empty, retiredAt = :now, updatedAt = :now, updatedBy = :actor",
            ConditionExpression="#version = :expected AND governanceStatus = :active",
            ExpressionAttributeNames={"#version": "version"},
            ExpressionAttributeValues={
                ":retired": RETIRED,
                ":pending": PENDING,
                ":empty": "",
                ":now": _now(),
                ":actor": actor_id,
                ":expected": expected_version,
                ":active": ACTIVE,
            },
            ReturnValues="ALL_NEW",
        )["Attributes"]
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise SourceConflict from exc
        raise
    _delete_objects(_object_prefix(source_id))
    audit.record("sources", "SOURCE_RETIRED", actor_id, source_id, version=expected_version)
    return item


# ---------- Synchronization ----------


def sync_state() -> dict:
    return _table().get_item(Key={"sourceId": SYNC_STATE_ID}).get("Item") or {}


def list_runs(limit: int = 10) -> list[dict]:
    runs: list[dict] = []
    kwargs: dict = {}
    while True:
        page = _table().scan(**kwargs)
        runs.extend(i for i in page.get("Items", []) if i["sourceId"].startswith(RUN_PREFIX))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    runs.sort(key=lambda r: r.get("startedAt", ""), reverse=True)
    return runs[:limit]


def _release_claim(claim: str, **values) -> None:
    sets = ", ".join(f"{k} = :{k}" for k in values)
    try:
        _table().update_item(
            Key={"sourceId": SYNC_STATE_ID},
            UpdateExpression="REMOVE activeJobId, runSources" + (f" SET {sets}" if sets else ""),
            ConditionExpression="activeJobId = :claim",
            ExpressionAttributeValues={":claim": claim, **{f":{k}": v for k, v in values.items()}},
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


def request_sync(actor_id: str = "scheduler") -> dict:
    """Start one ingestion run for all pending changes, unless a run is already active.
    Changes made while a run is active stay PENDING and are picked up by the next run."""
    if sync_state().get("activeJobId"):
        return sync_state()
    pending = [s for s in list_sources() if s.get("syncStatus") == PENDING]
    if not pending:
        return sync_state()

    claim = f"STARTING#{uuid.uuid4().hex}"
    try:
        _table().update_item(
            Key={"sourceId": SYNC_STATE_ID},
            UpdateExpression="SET activeJobId = :claim, claimedAt = :now",
            ConditionExpression="attribute_not_exists(activeJobId)",
            ExpressionAttributeValues={":claim": claim, ":now": _now()},
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return sync_state()
        raise

    snapshot = {s["sourceId"]: int(s["version"]) for s in pending}
    try:
        job = bedrock_agent().start_ingestion_job(
            **_kb_ids(),
            clientToken=f"sync-{claim.split('#', 1)[1]}",
            description=f"{len(snapshot)} source change(s)",
        )["ingestionJob"]
    except Exception as exc:
        # ConflictException means another run holds the data source; throttling clears on retry.
        code = (
            exc.response["Error"]["Code"] if isinstance(exc, ClientError) else type(exc).__name__
        )
        log.warning("start_ingestion_job failed: %s", code)
        _release_claim(claim, lastStartError=code, lastStartErrorAt=_now())
        return sync_state()

    job_id = job["ingestionJobId"]
    started = _now()
    _table().update_item(
        Key={"sourceId": SYNC_STATE_ID},
        UpdateExpression="SET activeJobId = :job, runSources = :snapshot, startedAt = :now "
        "REMOVE lastStartError",
        ConditionExpression="activeJobId = :claim",
        ExpressionAttributeValues={
            ":job": job_id,
            ":snapshot": snapshot,
            ":now": started,
            ":claim": claim,
        },
    )
    _table().put_item(
        Item={
            "sourceId": f"{RUN_PREFIX}{job_id}",
            "jobId": job_id,
            "status": job.get("status", "STARTING"),
            "startedAt": started,
            "requestedBy": actor_id,
            "sources": snapshot,
        }
    )
    for source_id, version in snapshot.items():
        try:
            _table().update_item(
                Key={"sourceId": source_id},
                UpdateExpression="SET syncStatus = :syncing, syncJobId = :job",
                ConditionExpression="#version = :v AND syncStatus = :pending",
                ExpressionAttributeNames={"#version": "version"},
                ExpressionAttributeValues={
                    ":syncing": SYNCING,
                    ":job": job_id,
                    ":v": version,
                    ":pending": PENDING,
                },
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
    log.info("ingestion job %s started for %d source(s)", job_id, len(snapshot))
    return sync_state()


def _failed_documents() -> dict[str, str]:
    failed: dict[str, str] = {}
    kwargs = {**_kb_ids(), "maxResults": 100}
    while True:
        page = bedrock_agent().list_knowledge_base_documents(**kwargs)
        for doc in page.get("documentDetails", []):
            if doc.get("status") not in FAILED_DOCUMENT_STATES:
                continue
            uri = doc.get("identifier", {}).get("s3", {}).get("uri", "")
            match = re.search(r"/sources/([^/]+)/", uri)
            if match:
                reason = doc.get("statusReason") or doc["status"]
                failed[match.group(1)] = reason[:300]
        if not page.get("nextToken"):
            return failed
        kwargs["nextToken"] = page["nextToken"]


def _verify_removed(source: dict) -> bool:
    results = bedrock_agent_runtime().retrieve(
        knowledgeBaseId=get_settings().knowledge_base_id,
        retrievalQuery={"text": source.get("title", source["sourceId"])[:500]},
        retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 25}},
    )["retrievalResults"]
    return all(r.get("metadata", {}).get("sourceId") != source["sourceId"] for r in results)


def refresh_sync() -> dict:
    """Advance the active ingestion run, if any, and start the next one when needed."""
    state = sync_state()
    job_id = state.get("activeJobId")
    if not job_id:
        return request_sync()
    if job_id.startswith("STARTING#"):
        claimed = datetime.fromisoformat(state.get("claimedAt", _now()))
        if datetime.now(UTC) - claimed > STALE_CLAIM:
            _release_claim(job_id)
        return sync_state()

    job = bedrock_agent().get_ingestion_job(**_kb_ids(), ingestionJobId=job_id)["ingestionJob"]
    status = job["status"]
    stats = {k: int(v) for k, v in job.get("statistics", {}).items() if isinstance(v, int)}
    run_values = {"status": status, "statistics": stats}
    if status in RUNNING_JOB_STATES:
        _update_run(job_id, run_values)
        return state

    snapshot = {k: int(v) for k, v in state.get("runSources", {}).items()}
    failed_docs = _failed_documents() if stats.get("numberOfDocumentsFailed") or status != "COMPLETE" else {}
    job_reason = "; ".join(job.get("failureReasons", []))[:300]
    finished = _now()

    for source_id, version in snapshot.items():
        succeeded = status == "COMPLETE" and source_id not in failed_docs
        message = "" if succeeded else failed_docs.get(source_id) or job_reason or f"Sync {status.lower()}"
        values = {
            ":status": SYNCED if succeeded else FAILED,
            ":msg": message,
            ":at": finished,
            ":job": job_id,
            ":v": version,
        }
        expression = "SET syncStatus = :status, syncMessage = :msg, lastSyncAt = :at"
        if succeeded:
            expression += ", syncedVersion = :v"
        try:
            # A newer edit during the run keeps that source PENDING for the next run.
            _table().update_item(
                Key={"sourceId": source_id},
                UpdateExpression=expression,
                ConditionExpression="syncJobId = :job AND #version = :v",
                ExpressionAttributeNames={"#version": "version"},
                ExpressionAttributeValues=values,
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise

    for source_id in snapshot:
        source = get_source(source_id)
        if source and source.get("governanceStatus") == RETIRED and source.get("syncStatus") == SYNCED:
            verified = _verify_removed(source)
            _table().update_item(
                Key={"sourceId": source_id},
                UpdateExpression="SET removalVerified = :ok, removalCheckedAt = :at",
                ExpressionAttributeValues={":ok": verified, ":at": _now()},
            )

    run_values.update({"finishedAt": finished, "failureReason": job_reason})
    _update_run(job_id, run_values)
    _release_claim(job_id, lastJobId=job_id, lastJobStatus=status, lastFinishedAt=finished)
    log.info("ingestion job %s finished: %s", job_id, status)
    return request_sync()


def _update_run(job_id: str, values: dict) -> None:
    names = {f"#{k}": k for k in values}
    _table().update_item(
        Key={"sourceId": f"{RUN_PREFIX}{job_id}"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in values),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={f":{k}": v for k, v in values.items()},
    )


# ---------- Eligible retrieval ----------


def eligible_versions() -> dict[str, dict]:
    return {
        s["sourceId"]: s
        for s in list_sources()
        if s.get("governanceStatus") == ACTIVE
    }


def retrieve(queries: list[str], limit: int, prefix: str) -> list[Evidence]:
    """Retrieve passages for several queries and keep only current, active source versions."""
    inventory = eligible_versions()
    seen: set[str] = set()
    evidence: list[Evidence] = []
    for query in queries:
        results = bedrock_agent_runtime().retrieve(
            knowledgeBaseId=get_settings().knowledge_base_id,
            retrievalQuery={"text": query[:900]},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 12}},
        )["retrievalResults"]
        for result in results:
            meta = result.get("metadata", {})
            source = inventory.get(str(meta.get("sourceId", "")))
            try:
                version = int(float(meta.get("version", -1)))
            except (TypeError, ValueError):
                continue
            if not source or version != int(source["version"]):
                continue
            chunk_id = str(meta.get("x-amz-bedrock-kb-chunk-id", "")) or result["content"]["text"][:80]
            if chunk_id in seen:
                continue
            seen.add(chunk_id)
            evidence.append(
                Evidence(
                    ref="",
                    source_id=source["sourceId"],
                    version=version,
                    title=source["title"],
                    source_type=source["sourceType"],
                    excerpt=" ".join(result["content"]["text"].split())[:EXCERPT_CHARS],
                    score=float(result.get("score", 0)),
                )
            )
    evidence.sort(key=lambda e: e.score, reverse=True)
    evidence = evidence[:limit]
    for i, item in enumerate(evidence, start=1):
        item.ref = f"{prefix}{i}"
    return evidence
