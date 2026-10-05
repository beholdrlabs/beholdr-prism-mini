import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

SKILL_DIR = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((SKILL_DIR / "assets" / "config.schema.v1.json").read_text(encoding="utf-8"))
TEMPLATE = (SKILL_DIR / "assets" / "config.template.json").read_text(encoding="utf-8")

FAST = [{"model": "fast-model", "via": "omp", "effort": "low"}]
REASONING = [{"model": "deep-model", "via": "claude-code", "effort": "high", "notes": "primary"}]


def errors(doc):
    return list(Draft202012Validator(SCHEMA).iter_errors(doc))


def test_schema_is_valid_draft_2020_12():
    Draft202012Validator.check_schema(SCHEMA)


def test_accepts_full_config():
    doc = {
        "version": 1,
        "roles": {"fast": FAST, "reasoning": REASONING},
        "compression": {"enabled": True, "brief_max_words": 800},
    }
    assert errors(doc) == []


def test_accepts_partial_file_and_herdr_via():
    doc = {"version": 1, "roles": {"fast": [{"model": "m", "via": "herdr:omp"}]}}
    assert errors(doc) == []


@pytest.mark.parametrize(
    "doc",
    [
        {"roles": {"fast": FAST}},
        {"version": 2},
        {"version": "1"},
        {"version": 1, "api_key": "x"},
        {"version": 1, "roles": {"worker": FAST}},
        {"version": 1, "roles": {"fast": []}},
        {"version": 1, "roles": {"fast": [{"via": "omp"}]}},
        {"version": 1, "roles": {"fast": [{"model": "m", "via": "openrouter"}]}},
        {"version": 1, "roles": {"fast": [{"model": "m", "via": "herdr:"}]}},
        {"version": 1, "roles": {"fast": [{"model": "m", "via": "omp", "effort": "ultra"}]}},
        {"version": 1, "roles": {"fast": [{"model": "m", "via": "omp", "key": "sk-x"}]}},
        {"version": 1, "compression": {"brief_max_words": 50}},
        {"version": 1, "compression": {"enabled": "yes"}},
    ],
)
def test_rejects_invalid(doc):
    assert errors(doc)


def test_accepts_schema_key():
    assert errors({"$schema": "file:///skill/assets/config.schema.v1.json", "version": 1}) == []


def test_template_has_schema_placeholder_and_empty_roles():
    data = json.loads(TEMPLATE)
    assert next(iter(data)) == "$schema"
    assert data.pop("$schema") == "{{SCHEMA_URI}}"
    assert data == {
        "version": 1,
        "roles": {"fast": [], "reasoning": []},
        "compression": {"enabled": True, "brief_max_words": 800},
    }
