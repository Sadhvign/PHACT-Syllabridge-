"""Privacy scrubbing and input policy checks that run before any model call."""

import logging
from collections import Counter
from dataclasses import dataclass, field

from app import observability
from app.aws import bedrock_runtime, comprehend
from app.config import get_settings

log = logging.getLogger("phact.safety")

COMPREHEND_MAX_BYTES = 90_000
GUARDRAIL_CHUNK_CHARS = 20_000
PII_MIN_SCORE = 0.6
# Course schedules and reading links are needed for the analysis and identify no one.
PII_TYPES_KEPT = {"DATE_TIME", "URL"}

POLICY_MESSAGES = {
    "OFF_TOPIC": "This text doesn't look like a course syllabus or curriculum material, "
    "so PHACT can't analyze it. Check that you uploaded the right file.",
    "MEDICAL_ADVICE": "This text asks for medical advice about a specific person. "
    "PHACT only analyzes course syllabi.",
    "ACADEMIC_DISHONESTY": "This text asks PHACT to complete or disguise student work, "
    "which it can't help with.",
    "PROMPT_ATTACK": "This text contains instructions aimed at the AI system rather than "
    "course content. Remove them and try again.",
    "UNSAFE_CONTENT": "This text contains content PHACT's safety policy doesn't allow. "
    "Review the syllabus text and try again.",
}

TOPIC_CODES = {
    "Off-topic content": "OFF_TOPIC",
    "Individual medical advice": "MEDICAL_ADVICE",
    "Academic dishonesty": "ACADEMIC_DISHONESTY",
}


@dataclass
class ScrubResult:
    text: str
    redactions: dict[str, int] = field(default_factory=dict)

    @property
    def redaction_count(self) -> int:
        return sum(self.redactions.values())


@dataclass
class PolicyResult:
    passed: bool
    code: str = ""

    @property
    def message(self) -> str:
        return POLICY_MESSAGES.get(self.code, POLICY_MESSAGES["UNSAFE_CONTENT"])


def _chunks_by_bytes(text: str, max_bytes: int) -> list[str]:
    # A UTF-8 character is at most 4 bytes, so this many characters always fits.
    max_line_chars = max_bytes // 4
    lines: list[str] = []
    for line in text.splitlines(keepends=True):
        lines.extend(line[i : i + max_line_chars] for i in range(0, len(line), max_line_chars))

    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for line in lines:
        line_bytes = len(line.encode("utf-8"))
        if size + line_bytes > max_bytes and current:
            chunks.append("".join(current))
            current, size = [], 0
        current.append(line)
        size += line_bytes
    if current:
        chunks.append("".join(current))
    return chunks


def scrub_pii(text: str) -> ScrubResult:
    """Scrub PII from text. Logs counts only — never entity values or raw spans."""
    counts: Counter[str] = Counter()
    output: list[str] = []
    with observability.timed("PiiScrubLatency") as timing:
        for chunk in _chunks_by_bytes(text, COMPREHEND_MAX_BYTES):
            if not chunk.strip():
                output.append(chunk)
                continue
            entities = comprehend().detect_pii_entities(Text=chunk, LanguageCode="en")["Entities"]
            spans = sorted(
                (
                    e
                    for e in entities
                    if e["Score"] >= PII_MIN_SCORE and e["Type"] not in PII_TYPES_KEPT
                ),
                key=lambda e: e["BeginOffset"],
                reverse=True,
            )
            last_begin = len(chunk) + 1
            for entity in spans:
                begin, end = entity["BeginOffset"], entity["EndOffset"]
                if end > last_begin:
                    continue  # overlaps a span already replaced
                chunk = f"{chunk[:begin]}[{entity['Type']}]{chunk[end:]}"
                counts[entity["Type"]] += 1
                last_begin = begin
            output.append(chunk)
    total = sum(counts.values())
    observability.info(
        log,
        "pii_scrub_complete",
        redaction_total=total,
        redaction_types=len(counts),
        duration_ms=timing["duration_ms"],
        input_chars=len(text),
    )
    observability.metric("PiiScrub", 1, dimensions={"Result": "ok"})
    if total:
        observability.metric("PiiRedactions", total, unit="Count")
    return ScrubResult(text="".join(output), redactions=dict(counts))


def _policy_code(assessments: list[dict]) -> str:
    for assessment in assessments:
        for topic in assessment.get("topicPolicy", {}).get("topics", []):
            if topic.get("action") == "BLOCKED":
                return TOPIC_CODES.get(topic.get("name", ""), "UNSAFE_CONTENT")
        for item in assessment.get("contentPolicy", {}).get("filters", []):
            if item.get("action") == "BLOCKED":
                return "PROMPT_ATTACK" if item.get("type") == "PROMPT_ATTACK" else "UNSAFE_CONTENT"
    return "UNSAFE_CONTENT"


def check_input(text: str) -> PolicyResult:
    """Evaluate scrubbed text with the input guardrail. Raises if the check itself fails.

    Logs and metrics use policy codes only — never assessments payloads or text.
    """
    settings = get_settings()
    if not settings.guardrail_id:
        raise RuntimeError("Input guardrail is not configured")
    with observability.timed("GuardrailLatency") as timing:
        for start in range(0, len(text), GUARDRAIL_CHUNK_CHARS):
            response = bedrock_runtime().apply_guardrail(
                guardrailIdentifier=settings.guardrail_id,
                guardrailVersion=settings.guardrail_version,
                source="INPUT",
                content=[{"text": {"text": text[start : start + GUARDRAIL_CHUNK_CHARS]}}],
            )
            if response["action"] == "GUARDRAIL_INTERVENED":
                code = _policy_code(response.get("assessments", []))
                observability.warning(
                    log,
                    "guardrail_blocked",
                    code=code,
                    guardrail_version=settings.guardrail_version,
                    duration_ms=timing["duration_ms"],
                )
                observability.metric(
                    "GuardrailDecision",
                    1,
                    dimensions={"Result": "blocked", "Code": code},
                )
                return PolicyResult(passed=False, code=code)
    observability.info(
        log,
        "guardrail_passed",
        guardrail_version=settings.guardrail_version,
        duration_ms=timing["duration_ms"],
        input_chars=len(text),
    )
    observability.metric(
        "GuardrailDecision",
        1,
        dimensions={"Result": "passed", "Code": "OK"},
    )
    return PolicyResult(passed=True)
