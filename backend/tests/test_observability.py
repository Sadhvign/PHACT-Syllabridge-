"""Unit checks for safe observability helpers (no AWS calls)."""

from app.observability import sanitize_fields


def test_sanitize_drops_forbidden_content_keys():
    clean = sanitize_fields(
        {
            "analysis_id": "abc123",
            "prompt": "SECRET SYLLABUS TEXT",
            "text": "raw pii",
            "assessments": [{"topicPolicy": "blocked"}],
            "entities": [{"Type": "EMAIL", "Score": 0.99}],
            "scrubbed_text": "still secret",
            "code": "OFF_TOPIC",
            "redactions": {"EMAIL": 2, "PHONE": 1},
            "input_tokens": 1200,
        }
    )
    assert clean["analysis_id"] == "abc123"
    assert clean["code"] == "OFF_TOPIC"
    assert clean["redactions"] == {"EMAIL": 2, "PHONE": 1}
    assert clean["input_tokens"] == 1200
    assert "prompt" not in clean
    assert "text" not in clean
    assert "assessments" not in clean
    assert "entities" not in clean
    assert "scrubbed_text" not in clean


def test_sanitize_truncates_long_strings():
    clean = sanitize_fields({"path": "x" * 500})
    assert len(clean["path"]) == 120
