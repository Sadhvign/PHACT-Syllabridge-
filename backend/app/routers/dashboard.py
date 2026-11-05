from datetime import UTC, datetime, timedelta

from boto3.dynamodb.conditions import Key
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import User, get_current_user
from app.aws import table
from app.config import get_settings

router = APIRouter(prefix="/api", tags=["dashboard"])


class Stats(BaseModel):
    syllabi_uploaded: int
    syllabi_this_month: int
    competencies_mapped: int
    analyses_completed: int
    actions_this_week: int
    pending_reviews: int


class RecentUpload(BaseModel):
    syllabus_id: str
    title: str
    uploaded_at: str
    status: str


class SavedRecommendation(BaseModel):
    analysis_id: str
    title: str
    saved_at: str
    review_status: str


class Dashboard(BaseModel):
    stats: Stats
    recent_uploads: list[RecentUpload]
    saved_recommendations: list[SavedRecommendation]


def _query_all(table_name: str, user_id: str) -> list[dict]:
    items: list[dict] = []
    kwargs = {"KeyConditionExpression": Key("userId").eq(user_id)}
    while True:
        page = table(table_name).query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def _since(items: list[dict], field: str, delta: timedelta) -> int:
    cutoff = (datetime.now(UTC) - delta).isoformat()
    return sum(1 for item in items if str(item.get(field, "")) >= cutoff)


@router.get("/dashboard", response_model=Dashboard)
def dashboard(user: User = Depends(get_current_user)) -> Dashboard:
    settings = get_settings()
    syllabi = [
        s
        for s in _query_all(settings.syllabi_table, user.user_id)
        if s.get("status") != "AWAITING_UPLOAD"
    ]
    analyses = [
        a for a in _query_all(settings.analyses_table, user.user_id) if a.get("itemType") == "JOB"
    ]

    syllabi.sort(key=lambda s: s.get("createdAt", ""), reverse=True)
    analyses.sort(key=lambda a: a.get("updatedAt", ""), reverse=True)
    completed = [a for a in analyses if int(a.get("latestRevision", 0)) > 0]

    stats = Stats(
        syllabi_uploaded=len(syllabi),
        syllabi_this_month=_since(syllabi, "createdAt", timedelta(days=30)),
        competencies_mapped=sum(int(a.get("competencyCount", 0)) for a in completed),
        analyses_completed=len(completed),
        actions_this_week=_since(syllabi, "createdAt", timedelta(days=7))
        + _since(analyses, "updatedAt", timedelta(days=7)),
        pending_reviews=sum(1 for a in completed if a.get("reviewStatus") == "DRAFT"),
    )

    return Dashboard(
        stats=stats,
        recent_uploads=[
            RecentUpload(
                syllabus_id=s["syllabusId"],
                title=s.get("title", "Untitled syllabus"),
                uploaded_at=s.get("createdAt", ""),
                status=s.get("status", "UPLOADED"),
            )
            for s in syllabi[:3]
        ],
        saved_recommendations=[
            SavedRecommendation(
                analysis_id=a["analysisId"],
                title=a.get("courseTitle", "Untitled analysis"),
                saved_at=a.get("updatedAt", ""),
                review_status=a.get("reviewStatus", "DRAFT"),
            )
            for a in completed[:3]
        ],
    )
