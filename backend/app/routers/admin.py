import logging
import uuid
from pathlib import PurePath

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app import sources
from app.auth import User, require_admin
from app.aws import s3
from app.config import get_settings

log = logging.getLogger("phact.admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])

MAX_SOURCE_BYTES = 50 * 1024 * 1024
CONFLICT_MESSAGE = "Someone else changed this source. Reload the list and try again."


class SourceView(BaseModel):
    source_id: str
    title: str
    source_type: str
    owner: str
    effective_date: str
    governance_status: str
    version: int
    file_name: str
    sync_status: str
    synced_version: int | None
    sync_message: str
    last_sync_at: str
    removal_verified: bool | None
    updated_at: str


class SyncView(BaseModel):
    active_job_id: str
    last_job_id: str
    last_job_status: str
    last_finished_at: str
    last_start_error: str


class Inventory(BaseModel):
    sources: list[SourceView]
    sync: SyncView


class UploadRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0, le=MAX_SOURCE_BYTES)


class UploadTicket(BaseModel):
    upload_id: str
    upload_url: str
    content_type: str


class SourceRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    source_type: str = Field(min_length=2, max_length=80)
    owner: str = Field(min_length=2, max_length=120)
    effective_date: str = Field(default="", max_length=10)
    upload_id: str | None = Field(default=None, max_length=64)
    file_name: str | None = Field(default=None, max_length=255)
    expected_version: int | None = Field(default=None, ge=1)


def _view(item: dict) -> SourceView:
    synced = item.get("syncedVersion")
    verified = item.get("removalVerified")
    return SourceView(
        source_id=item["sourceId"],
        title=item.get("title", ""),
        source_type=item.get("sourceType", ""),
        owner=item.get("owner", ""),
        effective_date=item.get("effectiveDate", ""),
        governance_status=item.get("governanceStatus", ""),
        version=int(item.get("version", 0)),
        file_name=item.get("fileName", ""),
        sync_status=item.get("syncStatus", ""),
        synced_version=int(synced) if synced is not None else None,
        sync_message=item.get("syncMessage", ""),
        last_sync_at=item.get("lastSyncAt", ""),
        removal_verified=bool(verified) if verified is not None else None,
        updated_at=item.get("updatedAt", ""),
    )


def _inventory() -> Inventory:
    state = sources.sync_state()
    items = sorted(sources.list_sources(), key=lambda i: i.get("title", "").lower())
    return Inventory(
        sources=[_view(i) for i in items],
        sync=SyncView(
            active_job_id=state.get("activeJobId", ""),
            last_job_id=state.get("lastJobId", ""),
            last_job_status=state.get("lastJobStatus", ""),
            last_finished_at=state.get("lastFinishedAt", ""),
            last_start_error=state.get("lastStartError", ""),
        ),
    )


def _meta(request: SourceRequest) -> dict:
    return {
        "title": request.title.strip(),
        "sourceType": request.source_type.strip(),
        "owner": request.owner.strip(),
        "effectiveDate": request.effective_date.strip(),
    }


def _staged_file(admin: User, request: SourceRequest) -> tuple[str, bytes]:
    if not request.upload_id or not request.file_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attach the source document.")
    try:
        body = sources.read_staged(admin.user_id, request.upload_id, request.file_name)
    except ClientError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The document upload didn't finish. Please try again."
        ) from exc
    return request.file_name, body


@router.get("/sources", response_model=Inventory)
def list_sources(_: User = Depends(require_admin)) -> Inventory:
    return _inventory()


@router.post("/sources/uploads", response_model=UploadTicket, status_code=status.HTTP_201_CREATED)
def create_source_upload(
    request: UploadRequest, admin: User = Depends(require_admin)
) -> UploadTicket:
    extension = PurePath(request.file_name).suffix.lower()
    content_type = sources.CONTENT_TYPES.get(extension)
    if not content_type:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Upload a PDF, Word, text, Markdown, or HTML document."
        )
    upload_id = uuid.uuid4().hex
    url = s3().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": get_settings().knowledge_bucket,
            "Key": sources.staging_key(admin.user_id, upload_id, request.file_name),
            "ContentType": content_type,
        },
        ExpiresIn=900,
    )
    return UploadTicket(upload_id=upload_id, upload_url=url, content_type=content_type)


@router.post("/sources", response_model=Inventory, status_code=status.HTTP_201_CREATED)
def add_source(request: SourceRequest, admin: User = Depends(require_admin)) -> Inventory:
    file_name, body = _staged_file(admin, request)
    sources.publish(actor_id=admin.user_id, meta=_meta(request), file_name=file_name, body=body)
    sources.discard_staged(admin.user_id, request.upload_id or "")
    sources.request_sync(admin.user_id)
    return _inventory()


@router.put("/sources/{source_id}", response_model=Inventory)
def update_source(
    source_id: str, request: SourceRequest, admin: User = Depends(require_admin)
) -> Inventory:
    current = sources.get_source(source_id)
    if not current:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn't find that source.")
    if request.expected_version is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing the version you edited.")
    if request.upload_id:
        file_name, body = _staged_file(admin, request)
    else:
        file_name = current["fileName"]
        body = s3().get_object(Bucket=get_settings().knowledge_bucket, Key=current["s3Key"])[
            "Body"
        ].read()
    try:
        sources.publish(
            actor_id=admin.user_id,
            source_id=source_id,
            expected_version=request.expected_version,
            meta=_meta(request),
            file_name=file_name,
            body=body,
        )
    except sources.SourceConflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MESSAGE) from exc
    if request.upload_id:
        sources.discard_staged(admin.user_id, request.upload_id)
    sources.request_sync(admin.user_id)
    return _inventory()


@router.delete("/sources/{source_id}", response_model=Inventory)
def retire_source(
    source_id: str,
    expected_version: int = Query(ge=1),
    admin: User = Depends(require_admin),
) -> Inventory:
    if not sources.get_source(source_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn't find that source.")
    try:
        sources.retire(source_id, admin.user_id, expected_version)
    except sources.SourceConflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MESSAGE) from exc
    sources.request_sync(admin.user_id)
    return _inventory()


@router.post("/sources/sync", response_model=Inventory)
def sync_now(admin: User = Depends(require_admin)) -> Inventory:
    sources.refresh_sync()
    return _inventory()
