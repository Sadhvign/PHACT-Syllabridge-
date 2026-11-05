"""Tools the refine-until-accept recommendations agent can call.

These are also exposed by the optional MCP server; the in-process agent
invokes them directly during faculty-feedback regeneration.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from xml.etree import ElementTree

from botocore.exceptions import ClientError

from app import sources

log = logging.getLogger("phact.mcp_tools")

# Curated fallback when live news fetch is unavailable (demo / offline).
_DEMO_HEADLINES = [
    {
        "title": "Schools of public health expand generative AI literacy for MPH students",
        "summary": "Programs are embedding responsible-AI modules into methods and practice courses.",
        "source": "ASPPH news desk (demo)",
        "url": "",
    },
    {
        "title": "Workforce survey: graduates need AI-aware epidemiology and communication skills",
        "summary": "Employers report demand for critical appraisal of AI-assisted analyses and clear disclosure.",
        "source": "Public health workforce brief (demo)",
        "url": "",
    },
    {
        "title": "Assessment redesign prioritizes oral defense and process portfolios over take-home essays",
        "summary": "Faculty are pairing AI-supported drafting with AI-resistant demonstration of learning.",
        "source": "Higher-ed teaching digest (demo)",
        "url": "",
    },
]


def search_aspph_sources(query: str, limit: int = 5) -> list[dict]:
    """Retrieve passages from the approved ASPPH knowledge base."""
    q = (query or "").strip()[:400]
    if not q:
        return []
    try:
        hits = sources.retrieve([q], limit=max(1, min(limit, 8)), prefix="S")
    except ClientError as exc:
        log.warning("search_aspph_sources failed: %s", exc.response["Error"]["Code"])
        return [{"error": "ASPPH source search is temporarily unavailable."}]
    return [
        {
            "ref": e.ref,
            "source_id": e.source_id,
            "title": e.title,
            "version": e.version,
            "source_type": e.source_type,
            "excerpt": e.excerpt[:600],
            "score": e.score,
        }
        for e in hits
    ]


def list_competency_frameworks() -> list[dict]:
    """List competency-oriented sources faculty can ground mappings against."""
    frameworks: list[dict] = []
    try:
        for item in sources.list_sources():
            if item.get("status") and item["status"] != "ACTIVE":
                continue
            title = item.get("title") or ""
            source_type = item.get("sourceType") or ""
            blob = f"{title} {source_type}".lower()
            if not any(k in blob for k in ("competenc", "ceph", "workforce", "mph")):
                continue
            frameworks.append(
                {
                    "source_id": item.get("sourceId", ""),
                    "title": title,
                    "source_type": source_type,
                    "version": int(item.get("version", 1)),
                }
            )
    except ClientError as exc:
        log.warning("list_competency_frameworks scan failed: %s", exc.response["Error"]["Code"])

    if frameworks:
        return frameworks[:12]

    return [
        {
            "source_id": "ceph-mph-foundational",
            "title": "CEPH MPH Foundational Competencies",
            "source_type": "COMPETENCY_FRAMEWORK",
            "version": 1,
            "note": "Use KB search for specific competency language.",
        },
        {
            "source_id": "ceph-foundational-knowledge",
            "title": "CEPH Foundational Public Health Knowledge",
            "source_type": "COMPETENCY_FRAMEWORK",
            "version": 1,
        },
        {
            "source_id": "workforce-expectations",
            "title": "Public health graduate workforce expectations",
            "source_type": "WORKFORCE",
            "version": 1,
        },
    ]


def fetch_public_health_news(topic: str = "public health AI education", limit: int = 5) -> list[dict]:
    """Fetch recent public-health / higher-ed headlines; fall back to demo items."""
    topic = (topic or "public health AI education").strip()[:120]
    limit = max(1, min(limit, 8))
    items = _rss_headlines(
        "https://tools.cdc.gov/api/v2/resources/media/132608.rss",
        limit=limit,
    )
    if not items:
        items = [
            {**h, "topic": topic}
            for h in _DEMO_HEADLINES[:limit]
        ]
        for item in items:
            item["note"] = "Demo headline; live feed unavailable."
    else:
        for item in items:
            item["topic"] = topic
    return items


def _rss_headlines(url: str, limit: int) -> list[dict]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PHACT/1.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            raw = resp.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.info("news feed unavailable: %s", type(exc).__name__)
        return []

    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError:
        return []

    out: list[dict] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        summary = (item.findtext("description") or "").strip()
        link = (item.findtext("link") or "").strip()
        if not title:
            continue
        out.append(
            {
                "title": title[:200],
                "summary": summary[:400],
                "source": "CDC / public feed",
                "url": link[:300],
            }
        )
        if len(out) >= limit:
            break
    return out


def tool_result_text(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False)[:6000]
