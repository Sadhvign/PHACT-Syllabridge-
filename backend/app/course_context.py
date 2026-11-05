"""Faculty-chosen course context that steers recommendation difficulty and tone."""

from __future__ import annotations

GRADE_LEVELS = {
    "BACHELORS": "Bachelor's (undergraduate)",
    "MASTERS": "Master's",
    "PHD": "PhD",
    "DOCTORATE": "Doctorate (professional doctorate)",
}

COURSE_FOCUSES = {
    "INDUSTRY": "Industry-focused (practice, workforce, applied skills)",
    "RESEARCH": "Research-focused (methods, inquiry, scholarship)",
    "BALANCED": "Balanced between industry and research",
}

# Demo horizon; expand later as needed.
TERMS = {
    "FALL_2027": "Fall 2027",
    "SPRING_2027": "Spring 2027",
    "SUMMER_2027": "Summer 2027",
}

GRADE_DIFFICULTY = {
    "BACHELORS": (
        "Pitch recommendations at an undergraduate level: clear scaffolding, guided practice, "
        "and accessible AI literacy without assuming advanced methods."
    ),
    "MASTERS": (
        "Pitch recommendations at a master's level: graduate rigor, applied analysis, "
        "and professional judgment with responsible AI use."
    ),
    "PHD": (
        "Pitch recommendations at a PhD level: research design, methodological critique, "
        "and scholarly use of AI with strong integrity expectations."
    ),
    "DOCTORATE": (
        "Pitch recommendations at a professional-doctorate level: advanced practice leadership, "
        "applied scholarship, and accountable AI use in the field."
    ),
}

FOCUS_GUIDANCE = {
    "INDUSTRY": (
        "INDUSTRY-GRADE course. Prioritize workforce-ready skills, employer tools, case-based "
        "practice, GenAI/agentic workflows used on the job, applied assignments, midterms/finals "
        "that mirror workplace deliverables, and AI policies that match practice settings."
    ),
    "RESEARCH": (
        "RESEARCH-GRADE course. Prioritize methods, evidence appraisal, reproducibility, "
        "literature review with GenAI, analysis pipelines, scholarly communication, research "
        "design critiques, and assignments that look like papers, lab notes, or reproducible repos."
    ),
    "BALANCED": (
        "BALANCED course. Mix practice-oriented and research-oriented enhancements so students "
        "build both applied and scholarly AI fluency across weekly topics and assessments."
    ),
}

# What the first recommendation pass must emphasize before later faculty refine feedback.
RECOMMENDATION_PRIORITIES = (
    "Primary job on the first pass: COURSE ENHANCEMENT (weekly topics / modules) and "
    "ASSIGNMENTS / grading structure. Prefer categories CONTENT_ENHANCEMENT and ASSESSMENT. "
    "Teaching-method tips are secondary unless they change a named week or assignment. "
    "Later refine passes may shift emphasis only when faculty feedback explicitly asks."
)


def normalize_grade(value: str) -> str:
    key = (value or "").strip().upper()
    return key if key in GRADE_LEVELS else ""


def normalize_focus(value: str) -> str:
    key = (value or "").strip().upper()
    return key if key in COURSE_FOCUSES else ""


def normalize_term(value: str) -> str:
    key = (value or "").strip().upper()
    return key if key in TERMS else ""


def label_grade(value: str) -> str:
    return GRADE_LEVELS.get(normalize_grade(value), "")


def label_focus(value: str) -> str:
    return COURSE_FOCUSES.get(normalize_focus(value), "")


def label_term(value: str) -> str:
    return TERMS.get(normalize_term(value), "")


def context_block(*, grade_level: str, course_focus: str, term: str) -> str:
    """Prompt fragment for agents; empty when no context was set."""
    grade = normalize_grade(grade_level)
    focus = normalize_focus(course_focus)
    term_key = normalize_term(term)
    if not (grade or focus or term_key):
        return ""
    lines = ["<course_context>"]
    if grade:
        lines.append(f"Grade level: {GRADE_LEVELS[grade]}")
        lines.append(f"Difficulty guidance: {GRADE_DIFFICULTY[grade]}")
    if focus:
        lines.append(f"Course focus: {COURSE_FOCUSES[focus]}")
        lines.append(f"Focus guidance: {FOCUS_GUIDANCE[focus]}")
        lines.append(f"Recommendation priority: {RECOMMENDATION_PRIORITIES}")
        if focus == "INDUSTRY":
            lines.append(
                "Shape week topics and assignments for industry readiness "
                "(tools, workflows, stakeholder briefs, applied GenAI/agentic systems)."
            )
        elif focus == "RESEARCH":
            lines.append(
                "Shape week topics and assignments for research readiness "
                "(methods, reproducibility, critique, scholarly GenAI use)."
            )
        else:
            lines.append(
                "Shape week topics and assignments with an even mix of industry practice and research methods."
            )
    if term_key:
        lines.append(f"Offered in: {TERMS[term_key]}")
        lines.append("Tie recommendations to this term's offering when timing matters.")
    lines.append("</course_context>")
    return "\n".join(lines) + "\n\n"
