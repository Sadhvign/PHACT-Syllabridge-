"""What the AI generated versus what faculty changed before approval."""

from difflib import SequenceMatcher

from app import agents
from app.review import OBJECTIVE_FIELDS, RECOMMENDATION_FIELDS, get_revision, list_revisions

AI_ORIGINS = {"GENERATED", "RETRY"}
KEPT = "KEPT"
EDITED = "EDITED"
EXCLUDED = "EXCLUDED"


def _text(value) -> str:
    return "\n".join(value) if isinstance(value, list) else str(value or "")


def _compare(baseline: list[dict], final: list[dict], fields: set[str]) -> tuple[dict, list[float], list[int]]:
    original = {item["id"]: item for item in baseline}
    items: dict[str, dict] = {}
    ratios: list[float] = []
    weights: list[int] = []
    for item in final:
        before = original.get(item["id"], {})
        changed = sorted(f for f in fields if _text(item.get(f)) != _text(before.get(f)))
        if item.get("excluded"):
            items[item["id"]] = {"status": EXCLUDED, "fields": []}
            continue
        items[item["id"]] = {"status": EDITED if changed else KEPT, "fields": changed}
        for field in fields:
            old, new = _text(before.get(field)), _text(item.get(field))
            if new:
                ratios.append(SequenceMatcher(None, old, new).ratio())
                weights.append(len(new))
    return items, ratios, weights


def _counts(items: dict) -> dict:
    statuses = [i["status"] for i in items.values()]
    return {
        "total": len(statuses),
        "kept": statuses.count(KEPT),
        "edited": statuses.count(EDITED),
        "excluded": statuses.count(EXCLUDED),
    }


def compute(user_id: str, analysis_id: str, revision: int, content: dict) -> dict:
    """Compare an approved revision with the latest AI-generated revision before it."""
    metas = [
        r for r in list_revisions(user_id, analysis_id)
        if r.get("origin") in AI_ORIGINS and int(r["revision"]) <= revision
    ]
    baseline = get_revision(user_id, analysis_id, int(metas[-1]["revision"]))["content"] if metas else content

    def part(source: dict, name: str, key: str) -> list[dict]:
        return (source.get(name) or {}).get(key, [])

    recs, r_ratios, r_weights = _compare(
        part(baseline, agents.RECOMMENDATIONS, "recommendations"),
        part(content, agents.RECOMMENDATIONS, "recommendations"),
        RECOMMENDATION_FIELDS,
    )
    objs, o_ratios, o_weights = _compare(
        part(baseline, agents.COMPETENCIES, "objectives"),
        part(content, agents.COMPETENCIES, "objectives"),
        OBJECTIVE_FIELDS,
    )
    ratios, weights = r_ratios + o_ratios, r_weights + o_weights
    retained = sum(r * w for r, w in zip(ratios, weights)) / sum(weights) if weights else 1.0
    rec_counts, obj_counts = _counts(recs), _counts(objs)
    touched = rec_counts["edited"] + rec_counts["excluded"] + obj_counts["edited"] + obj_counts["excluded"]
    total = rec_counts["total"] + obj_counts["total"]
    return {
        "recommendations": recs,
        "objectives": objs,
        "stats": {
            "recommendations": rec_counts,
            "objectives": obj_counts,
            "ai_text_retained_percent": round(retained * 100),
            "faculty_changed_percent": round(touched / total * 100) if total else 0,
        },
    }
