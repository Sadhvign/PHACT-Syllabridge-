import uuid
from datetime import UTC, datetime
from pathlib import PurePath

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.auth import User, get_current_user
from app.aws import s3, table
from app.config import get_settings
from app.course_context import (
    COURSE_FOCUSES,
    GRADE_LEVELS,
    TERMS,
    label_focus,
    label_grade,
    label_term,
    normalize_focus,
    normalize_grade,
    normalize_term,
)
from app.extract import ExtractionError, extract_text, guess_course_code, guess_title

router = APIRouter(prefix="/api/syllabi", tags=["syllabi"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_TEXT_CHARS = 200_000
UPLOAD_URL_TTL_SECONDS = 900
CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}

AWAITING_UPLOAD = "AWAITING_UPLOAD"
EXTRACTED = "EXTRACTED"
EXTRACTION_FAILED = "EXTRACTION_FAILED"
CONFIRMED = "CONFIRMED"


class UploadRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)


class UploadTicket(BaseModel):
    syllabus_id: str
    upload_url: str
    content_type: str


class SyllabusSummary(BaseModel):
    syllabus_id: str
    title: str
    course_code: str
    grade_level: str = ""
    course_focus: str = ""
    term: str = ""
    grade_level_label: str = ""
    course_focus_label: str = ""
    term_label: str = ""
    file_name: str
    status: str
    word_count: int
    created_at: str
    updated_at: str


class SyllabusDetail(SyllabusSummary):
    page_count: int | None
    text: str
    message: str


class ConfirmRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    course_code: str = Field(default="", max_length=40)
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    grade_level: str = Field(min_length=1, max_length=32)
    course_focus: str = Field(min_length=1, max_length=32)
    term: str = Field(min_length=1, max_length=32)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _table():
    return table(get_settings().syllabi_table)


def _bucket() -> str:
    return get_settings().uploads_bucket


def _prefix(user: User, syllabus_id: str) -> str:
    return f"users/{user.user_id}/syllabi/{syllabus_id}/"


def _get_item(user: User, syllabus_id: str) -> dict:
    item = _table().get_item(Key={"userId": user.user_id, "syllabusId": syllabus_id}).get("Item")
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn't find that syllabus.")
    return item


def _read_text(key: str | None) -> str:
    if not key:
        return ""
    body = s3().get_object(Bucket=_bucket(), Key=key)["Body"].read()
    return body.decode("utf-8")


def _write_text(key: str, text: str) -> None:
    s3().put_object(
        Bucket=_bucket(),
        Key=key,
        Body=text.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
    )


def _summary(item: dict) -> SyllabusSummary:
    grade = normalize_grade(item.get("gradeLevel", ""))
    focus = normalize_focus(item.get("courseFocus", ""))
    term = normalize_term(item.get("term", ""))
    return SyllabusSummary(
        syllabus_id=item["syllabusId"],
        title=item.get("title", "Untitled syllabus"),
        course_code=item.get("courseCode", ""),
        grade_level=grade,
        course_focus=focus,
        term=term,
        grade_level_label=label_grade(grade),
        course_focus_label=label_focus(focus),
        term_label=label_term(term),
        file_name=item.get("fileName", ""),
        status=item.get("status", AWAITING_UPLOAD),
        word_count=int(item.get("wordCount", 0)),
        created_at=item.get("createdAt", ""),
        updated_at=item.get("updatedAt", ""),
    )


def _detail(item: dict) -> SyllabusDetail:
    text_key = item.get("confirmedTextKey") or item.get("extractedTextKey")
    page_count = item.get("pageCount")
    return SyllabusDetail(
        **_summary(item).model_dump(),
        page_count=int(page_count) if page_count is not None else None,
        text=_read_text(text_key),
        message=item.get("message", ""),
    )


def _update(user: User, syllabus_id: str, values: dict) -> dict:
    values = {**values, "updatedAt": _now()}
    names = {f"#{k}": k for k in values}
    expression = "SET " + ", ".join(f"#{k} = :{k}" for k in values)
    return _table().update_item(
        Key={"userId": user.user_id, "syllabusId": syllabus_id},
        UpdateExpression=expression,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={f":{k}": v for k, v in values.items()},
        ReturnValues="ALL_NEW",
    )["Attributes"]


@router.get("", response_model=list[SyllabusSummary])
def list_syllabi(user: User = Depends(get_current_user)) -> list[SyllabusSummary]:
    items: list[dict] = []
    kwargs = {"KeyConditionExpression": Key("userId").eq(user.user_id)}
    while True:
        page = _table().query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    visible = [i for i in items if i.get("status") != AWAITING_UPLOAD]
    visible.sort(key=lambda i: i.get("createdAt", ""), reverse=True)
    return [_summary(i) for i in visible]


@router.post("", response_model=UploadTicket, status_code=status.HTTP_201_CREATED)
def create_upload(
    request: UploadRequest, user: User = Depends(get_current_user)
) -> UploadTicket:
    file_name = PurePath(request.file_name.replace("\\", "/")).name
    extension = PurePath(file_name).suffix.lower()
    content_type = CONTENT_TYPES.get(extension)
    if not content_type:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Upload a PDF, Word (.docx), or plain text file."
        )
    if request.size_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Files must be 25 MB or smaller.")

    syllabus_id = uuid.uuid4().hex
    key = f"{_prefix(user, syllabus_id)}original{extension}"
    now = _now()
    _table().put_item(
        Item={
            "userId": user.user_id,
            "syllabusId": syllabus_id,
            "title": PurePath(file_name).stem[:200] or "Untitled syllabus",
            "fileName": file_name,
            "fileExtension": extension,
            "originalKey": key,
            "status": AWAITING_UPLOAD,
            "createdAt": now,
            "updatedAt": now,
        }
    )
    upload_url = s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": _bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=UPLOAD_URL_TTL_SECONDS,
    )
    return UploadTicket(syllabus_id=syllabus_id, upload_url=upload_url, content_type=content_type)


@router.post("/{syllabus_id}/extract", response_model=SyllabusDetail)
def extract(syllabus_id: str, user: User = Depends(get_current_user)) -> SyllabusDetail:
    item = _get_item(user, syllabus_id)
    if item.get("status") == CONFIRMED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This syllabus is already confirmed.")

    try:
        head = s3().head_object(Bucket=_bucket(), Key=item["originalKey"])
    except ClientError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The upload didn't finish. Please try again."
        ) from exc
    if head["ContentLength"] > MAX_UPLOAD_BYTES:
        s3().delete_object(Bucket=_bucket(), Key=item["originalKey"])
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Files must be 25 MB or smaller.")

    data = s3().get_object(Bucket=_bucket(), Key=item["originalKey"])["Body"].read()
    try:
        result = extract_text(item["fileExtension"], data)
    except ExtractionError as exc:
        _update(user, syllabus_id, {"status": EXTRACTION_FAILED, "message": str(exc)})
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    text = result.text[:MAX_TEXT_CHARS]
    text_key = f"{_prefix(user, syllabus_id)}extracted.txt"
    _write_text(text_key, text)
    title = guess_title(text, item.get("title", "Untitled syllabus"))
    values = {
        "status": EXTRACTED,
        "title": title,
        "courseCode": guess_course_code(title),
        "extractedTextKey": text_key,
        "wordCount": len(text.split()),
        "message": "",
    }
    if result.page_count is not None:
        values["pageCount"] = result.page_count
    return _detail(_update(user, syllabus_id, values))


@router.get("/{syllabus_id}", response_model=SyllabusDetail)
def get_syllabus(syllabus_id: str, user: User = Depends(get_current_user)) -> SyllabusDetail:
    return _detail(_get_item(user, syllabus_id))


@router.put("/{syllabus_id}", response_model=SyllabusDetail)
def confirm(
    syllabus_id: str, request: ConfirmRequest, user: User = Depends(get_current_user)
) -> SyllabusDetail:
    item = _get_item(user, syllabus_id)
    if item.get("status") not in (EXTRACTED, CONFIRMED):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Upload and extract the syllabus before confirming it."
        )
    text = request.text.strip()
    if len(text.split()) < 20:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The syllabus text is too short to analyze."
        )
    grade = normalize_grade(request.grade_level)
    focus = normalize_focus(request.course_focus)
    term = normalize_term(request.term)
    if grade not in GRADE_LEVELS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Select the grade level this syllabus is for (Bachelor's, Master's, PhD, or Doctorate).",
        )
    if focus not in COURSE_FOCUSES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Select whether the course is industry-focused, research-focused, or balanced.",
        )
    if term not in TERMS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Select the term this syllabus is for (Fall, Spring, or Summer 2027).",
        )
    text_key = f"{_prefix(user, syllabus_id)}confirmed.txt"
    _write_text(text_key, text)
    return _detail(
        _update(
            user,
            syllabus_id,
            {
                "status": CONFIRMED,
                "title": request.title.strip(),
                "courseCode": request.course_code.strip(),
                "gradeLevel": grade,
                "courseFocus": focus,
                "term": term,
                "confirmedTextKey": text_key,
                "wordCount": len(text.split()),
                "confirmedAt": _now(),
            },
        )
    )


@router.delete("/{syllabus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_syllabus(syllabus_id: str, user: User = Depends(get_current_user)) -> Response:
    _get_item(user, syllabus_id)
    listing = s3().list_objects_v2(Bucket=_bucket(), Prefix=_prefix(user, syllabus_id))
    objects = [{"Key": o["Key"]} for o in listing.get("Contents", [])]
    if objects:
        s3().delete_objects(Bucket=_bucket(), Delete={"Objects": objects, "Quiet": True})
    _table().delete_item(Key={"userId": user.user_id, "syllabusId": syllabus_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
