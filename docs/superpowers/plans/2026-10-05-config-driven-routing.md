# Config-Driven Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn beholdr-prism-mini 1.x (hard-coded model defaults) into 2.0: a role-based router that reads a versioned `.beholdr/prism-mini.config.yaml`, adds input compression (fast gatherers → reasoning consumers), and dispatches across Claude Code, Codex, omp, and Herdr.

**Architecture:** The skill stays instruction-first. One stdlib-plus-two-deps Python script (`scripts/prism.py`, run by `uv run --script`) owns config discovery, schema validation, per-role merging, scaffolding, and migrations. `SKILL.md` describes the workflow and points to two focused references (dispatch recipes, model-choice guidance). No model names appear in `SKILL.md` or `README.md`.

**Tech Stack:** Python 3.11+, `uv` inline script metadata, PyYAML, `jsonschema` (Draft 2020-12), pytest (run through `uvx`), Agent Skills frontmatter.

**Spec:** `docs/superpowers/specs/2026-10-05-config-driven-routing-design.md`

## Global Constraints

- Config paths: project `.beholdr/prism-mini.config.yaml` (searched from cwd up to the git root), user `~/.beholdr/prism-mini.config.yaml`.
- Merge: project list replaces user list per role; omitted roles inherit; `compression` shallow-merges, project wins.
- Roles are exactly `fast` and `reasoning`. Both must be present after merge.
- `via` ∈ `claude-code`, `codex`, `omp`, `herdr:<kind>`. `effort` ∈ `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.
- `compression.enabled` default `true`; `compression.brief_max_words` default `800`, minimum `100`.
- Unknown keys rejected. No field may hold secrets; never print key values.
- `check` exit codes: `0` valid, `2` no config, `3` invalid, `4` migration needed, `5` config newer than skill. Usage errors exit `1`.
- Frontmatter: only `name`, `description`, `compatibility`, `metadata` (`version: "2.0.0"`, `config-schema: "1"`).
- `SKILL.md` and `README.md` name no models. `SKILL.md` stays well under 500 lines.
- The skill never chooses the primary model and never silently selects an unlisted paid route.
- Herdr is used only when a candidate's `via` is `herdr:<kind>` and `HERDR_ENV=1`.

## Review Focus

- Running `check` from a subdirectory of a repo must find the project config at the git root, not report "no config".
- Running with cwd = `$HOME` (or a non-git dir under it) must not count the user file twice as both user and project config.
- An empty file, a YAML syntax error, or a non-mapping top level must exit `3` with the file path and no Python traceback.
- A project file that sets only `fast` (or only `compression`) must inherit the user's other settings instead of failing.
- `version: "1"` (string), `version: true`, or a missing version must exit `3` with a message naming `version`, not crash or pass.

Each of these has a test in Task 2.

## File Structure

| Path | Responsibility |
| --- | --- |
| `assets/config.schema.v1.json` | JSON Schema for one config file (v1) |
| `assets/config.template.yaml` | Scaffold written by `init`; `{{SCHEMA_PATH}}` placeholder |
| `scripts/prism.py` | `check`, `init`, `migrate`; discovery, validation, merge, migrations |
| `tests/test_schema.py` | Schema and template tests |
| `tests/test_prism.py` | Script behaviour tests |
| `references/dispatch.md` | Per-`via` dispatch recipes |
| `references/choosing-models.md` | Role selection criteria, dated evidence and example candidates (replaces `references/benchmarks.md`) |
| `SKILL.md` | Workflow (rewritten) |
| `README.md` | Overview and setup (rewritten) |
| `docs/skill-discussion.md` | History; only its benchmarks link changes |

Run all tests with:

```bash
uvx --with pyyaml --with jsonschema pytest tests -q
```

---

### Task 1: Config schema and template

**Files:**
- Create: `assets/config.schema.v1.json`
- Create: `assets/config.template.yaml`
- Test: `tests/test_schema.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `assets/config.schema.v1.json` (Draft 2020-12; `properties.version` is `{"const": 1}`); `assets/config.template.yaml` whose first line is `# yaml-language-server: $schema={{SCHEMA_PATH}}` and whose data is `{"version": 1, "roles": {"fast": [], "reasoning": []}, "compression": {"enabled": true, "brief_max_words": 800}}`.

- [ ] **Step 1: Write the failing tests**

`tests/test_schema.py`:

```python
import json
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

SKILL_DIR = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((SKILL_DIR / "assets" / "config.schema.v1.json").read_text(encoding="utf-8"))
TEMPLATE = (SKILL_DIR / "assets" / "config.template.yaml").read_text(encoding="utf-8")

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


def test_template_has_schema_placeholder_and_empty_roles():
    assert TEMPLATE.splitlines()[0] == "# yaml-language-server: $schema={{SCHEMA_PATH}}"
    data = yaml.safe_load(TEMPLATE)
    assert data == {
        "version": 1,
        "roles": {"fast": [], "reasoning": []},
        "compression": {"enabled": True, "brief_max_words": 800},
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uvx --with pyyaml --with jsonschema pytest tests/test_schema.py -q`
Expected: collection error, `FileNotFoundError` for `assets/config.schema.v1.json`.

- [ ] **Step 3: Write the schema**

`assets/config.schema.v1.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "beholdr-prism-mini/config.schema.v1.json",
  "title": "beholdr-prism-mini routing config, version 1",
  "description": "One project or user config file. Never put API keys or tokens here.",
  "type": "object",
  "additionalProperties": false,
  "required": ["version"],
  "properties": {
    "version": {"const": 1},
    "roles": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "fast": {"$ref": "#/$defs/candidates"},
        "reasoning": {"$ref": "#/$defs/candidates"}
      }
    },
    "compression": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": {"type": "boolean"},
        "brief_max_words": {"type": "integer", "minimum": 100}
      }
    }
  },
  "$defs": {
    "candidates": {
      "description": "Candidates in preference order; the first runnable one is used.",
      "type": "array",
      "minItems": 1,
      "items": {"$ref": "#/$defs/candidate"}
    },
    "candidate": {
      "type": "object",
      "additionalProperties": false,
      "required": ["model", "via"],
      "properties": {
        "model": {"type": "string", "minLength": 1, "description": "Model identifier as the via harness names it."},
        "via": {"type": "string", "pattern": "^(claude-code|codex|omp|herdr:[a-z][a-z0-9-]*)$"},
        "effort": {"enum": ["none", "minimal", "low", "medium", "high", "xhigh", "max"]},
        "notes": {"type": "string"}
      }
    }
  }
}
```

- [ ] **Step 4: Write the template**

`assets/config.template.yaml`:

```yaml
# yaml-language-server: $schema={{SCHEMA_PATH}}
# beholdr-prism-mini routing config. Candidates are tried in order; the first
# one whose `via` can run here is used. See references/choosing-models.md in the skill.
# Never put API keys or tokens in this file.
version: 1

roles:
  # Gathering: grep, file reads, codebase research, web fetches.
  # Prefer cheap, quick models with reliable tool calls.
  fast: []
  #  - model: <model id as the harness names it>
  #    via: claude-code   # or codex, omp, herdr:<kind>
  #    effort: low
  # Code, designs, and decisions; consumes briefs from fast workers.
  reasoning: []

compression:
  enabled: true
  brief_max_words: 800
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uvx --with pyyaml --with jsonschema pytest tests/test_schema.py -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add assets tests/test_schema.py
git commit -m "Add v1 config schema and template"
```

---

### Task 2: `prism.py check` (discovery, validation, merge)

**Files:**
- Create: `scripts/prism.py`
- Test: `tests/test_prism.py`

**Interfaces:**
- Consumes: `assets/config.schema.v1.json`, `assets/config.template.yaml` (Task 1).
- Produces (module `prism`, used by Task 3 and tests):
  - Constants `SUPPORTED_VERSION: int = 1`, `ROLES = ("fast", "reasoning")`, `CONFIG_RELPATH = Path(".beholdr/prism-mini.config.yaml")`, `SCHEMA_HEADER = "# yaml-language-server: $schema="`, `EXIT_OK=0, EXIT_USAGE=1, EXIT_NO_CONFIG=2, EXIT_INVALID=3, EXIT_MIGRATE=4, EXIT_TOO_NEW=5`, `MIGRATIONS: dict[int, Callable[[dict], dict]] = {}`.
  - `class ConfigError(Exception)` with `.code: int`.
  - `schema_path(version: int) -> Path`, `load_schema(version: int) -> dict`
  - `git_root(start: Path) -> Path | None`, `user_config_path(home: Path) -> Path`, `project_target(cwd: Path) -> Path`, `project_config_path(cwd: Path, home: Path) -> Path | None`
  - `load_file(path: Path) -> dict`, `file_version(data: dict, path: Path) -> int`, `upgrade(data: dict, path: Path) -> dict`, `validate(data: dict, path: Path) -> None`, `merge(layers: list[dict]) -> dict`, `resolve(cwd: Path, home: Path) -> dict`
  - `main(argv: list[str] | None = None, *, cwd: Path | None = None, home: Path | None = None) -> int`

- [ ] **Step 1: Write the failing tests**

`tests/test_prism.py`:

```python
import json
import sys
from pathlib import Path

import pytest
import yaml

SKILL_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL_DIR / "scripts"))
import prism  # noqa: E402

FAST = [{"model": "fast-model", "via": "omp", "effort": "low"}]
REASONING = [{"model": "deep-model", "via": "claude-code", "effort": "high"}]


@pytest.fixture
def env(tmp_path):
    home = tmp_path / "home"
    repo = home / "repo"
    (repo / ".git").mkdir(parents=True)
    return home, repo


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data if isinstance(data, str) else yaml.safe_dump(data), encoding="utf-8")
    return path


def user_cfg(home):
    return home / ".beholdr" / "prism-mini.config.yaml"


def project_cfg(repo):
    return repo / ".beholdr" / "prism-mini.config.yaml"


def run(argv, home, cwd, capsys):
    code = prism.main(argv, cwd=cwd, home=home)
    out, err = capsys.readouterr()
    return code, out, err


def full(**extra):
    return {"version": 1, "roles": {"fast": FAST, "reasoning": REASONING}, **extra}


@pytest.fixture
def v2(monkeypatch):
    """Pretend the skill expects config v2 and ships a 1 -> 2 migration."""
    schema = prism.load_schema(1)
    schema["properties"]["version"] = {"const": 2}
    monkeypatch.setattr(prism, "SUPPORTED_VERSION", 2)
    monkeypatch.setattr(prism, "MIGRATIONS", {1: lambda d: {**d, "version": 2}})
    monkeypatch.setattr(prism, "load_schema", lambda version: schema)


def test_no_config_exits_2(env, capsys):
    home, repo = env
    code, out, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_NO_CONFIG
    assert "init" in err


def test_user_config_only(env, capsys):
    home, repo = env
    write(user_cfg(home), full())
    code, out, _ = run(["check", "--json"], home, repo, capsys)
    assert code == 0
    data = json.loads(out)
    assert data["roles"]["fast"] == FAST
    assert data["compression"] == {"enabled": True, "brief_max_words": 800}
    assert data["sources"] == {"user": str(user_cfg(home))}


def test_project_config_found_from_subdirectory(env, capsys):
    home, repo = env
    write(project_cfg(repo), full())
    deep = repo / "src" / "deep"
    deep.mkdir(parents=True)
    code, out, _ = run(["check", "--json"], home, deep, capsys)
    assert code == 0
    assert json.loads(out)["sources"] == {"project": str(project_cfg(repo))}


def test_project_role_replaces_user_role_and_inherits_others(env, capsys):
    home, repo = env
    write(user_cfg(home), full(compression={"brief_max_words": 500}))
    project_fast = [{"model": "project-fast", "via": "codex"}]
    write(project_cfg(repo), {"version": 1, "roles": {"fast": project_fast}, "compression": {"enabled": False}})
    code, out, _ = run(["check", "--json"], home, repo, capsys)
    assert code == 0
    data = json.loads(out)
    assert data["roles"] == {"fast": project_fast, "reasoning": REASONING}
    assert data["compression"] == {"enabled": False, "brief_max_words": 500}


def test_project_with_only_compression_inherits_roles(env, capsys):
    home, repo = env
    write(user_cfg(home), full())
    write(project_cfg(repo), {"version": 1, "compression": {"brief_max_words": 300}})
    code, out, _ = run(["check", "--json"], home, repo, capsys)
    assert code == 0
    assert json.loads(out)["roles"] == {"fast": FAST, "reasoning": REASONING}


def test_home_cwd_does_not_double_count_user_config(env, capsys):
    home, _ = env
    write(user_cfg(home), full())
    code, out, _ = run(["check", "--json"], home, home, capsys)
    assert code == 0
    assert json.loads(out)["sources"] == {"user": str(user_cfg(home))}


def test_non_git_directory_only_checks_cwd(env, capsys):
    home, _ = env
    outside = home / "notes" / "sub"
    outside.mkdir(parents=True)
    write(home / "notes" / ".beholdr" / "prism-mini.config.yaml", full())
    code, _, _ = run(["check"], home, outside, capsys)
    assert code == prism.EXIT_NO_CONFIG


@pytest.mark.parametrize("text", ["", "version: [1\n", "- just\n- a list\n"])
def test_unreadable_yaml_exits_3_with_path(env, capsys, text):
    home, repo = env
    path = write(project_cfg(repo), text)
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert str(path) in err
    assert "Traceback" not in err


@pytest.mark.parametrize("version", ["1", True, None, 0])
def test_bad_version_exits_3(env, capsys, version):
    home, repo = env
    doc = full()
    if version is None:
        del doc["version"]
    else:
        doc["version"] = version
    write(project_cfg(repo), doc)
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert "version" in err


def test_schema_error_names_json_path(env, capsys):
    home, repo = env
    doc = full()
    doc["roles"]["fast"] = [{"model": "m", "via": "openrouter"}]
    write(project_cfg(repo), doc)
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert "$.roles.fast[0].via" in err


def test_missing_role_after_merge_exits_3(env, capsys):
    home, repo = env
    write(project_cfg(repo), {"version": 1, "roles": {"fast": FAST}})
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert "reasoning" in err


def test_newer_config_exits_5(env, capsys):
    home, repo = env
    write(project_cfg(repo), full(version=2))
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_TOO_NEW
    assert "update" in err


def test_older_config_exits_4(env, capsys, v2):
    home, repo = env
    write(project_cfg(repo), full())
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_MIGRATE
    assert "migrate --project --write" in err


def test_text_output_is_yaml(env, capsys):
    home, repo = env
    write(project_cfg(repo), full())
    code, out, _ = run(["check"], home, repo, capsys)
    assert code == 0
    assert yaml.safe_load(out)["roles"]["reasoning"] == REASONING


def test_usage_error_exits_1(env, capsys):
    home, repo = env
    with pytest.raises(SystemExit) as exc:
        prism.main(["bogus"], cwd=repo, home=home)
    assert exc.value.code == prism.EXIT_USAGE
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uvx --with pyyaml --with jsonschema pytest tests/test_prism.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'prism'`.

- [ ] **Step 3: Write `scripts/prism.py` (check only)**

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6", "jsonschema>=4.18"]
# ///
"""Scaffold, validate, and migrate beholdr-prism-mini routing configs."""

from __future__ import annotations

import argparse
import copy
import json
import shutil
import sys
from collections.abc import Callable
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

SKILL_DIR = Path(__file__).resolve().parent.parent
ASSETS = SKILL_DIR / "assets"
SUPPORTED_VERSION = 1
ROLES = ("fast", "reasoning")
CONFIG_RELPATH = Path(".beholdr") / "prism-mini.config.yaml"
SCHEMA_HEADER = "# yaml-language-server: $schema="
DEFAULT_COMPRESSION = {"enabled": True, "brief_max_words": 800}

EXIT_OK, EXIT_USAGE, EXIT_NO_CONFIG, EXIT_INVALID, EXIT_MIGRATE, EXIT_TOO_NEW = 0, 1, 2, 3, 4, 5

# Config version N -> function returning the version N+1 document.
MIGRATIONS: dict[int, Callable[[dict], dict]] = {}


class ConfigError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


def schema_path(version: int) -> Path:
    return ASSETS / f"config.schema.v{version}.json"


def load_schema(version: int) -> dict:
    return json.loads(schema_path(version).read_text(encoding="utf-8"))


def git_root(start: Path) -> Path | None:
    for directory in (start, *start.parents):
        if (directory / ".git").exists():
            return directory
    return None


def user_config_path(home: Path) -> Path:
    return home / CONFIG_RELPATH


def project_target(cwd: Path) -> Path:
    return (git_root(cwd) or cwd) / CONFIG_RELPATH


def project_config_path(cwd: Path, home: Path) -> Path | None:
    """Search cwd up to the git root (or only cwd outside git), skipping the user file."""
    stop = git_root(cwd) or cwd
    user = user_config_path(home).resolve()
    for directory in (cwd, *cwd.parents):
        candidate = directory / CONFIG_RELPATH
        if candidate.is_file() and candidate.resolve() != user:
            return candidate
        if directory == stop:
            break
    return None


def load_file(path: Path) -> dict:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ConfigError(EXIT_INVALID, f"{path}: not valid YAML: {exc}") from None
    if not isinstance(data, dict):
        raise ConfigError(EXIT_INVALID, f"{path}: expected a mapping with a 'version' key")
    return data


def file_version(data: dict, path: Path) -> int:
    version = data.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise ConfigError(EXIT_INVALID, f"{path}: 'version' must be a positive integer, got {version!r}")
    if version > SUPPORTED_VERSION:
        raise ConfigError(
            EXIT_TOO_NEW,
            f"{path}: config version {version} is newer than this skill supports "
            f"({SUPPORTED_VERSION}); update beholdr-prism-mini",
        )
    return version


def upgrade(data: dict, path: Path) -> dict:
    version = file_version(data, path)
    while version < SUPPORTED_VERSION:
        step = MIGRATIONS.get(version)
        if step is None:
            raise ConfigError(EXIT_INVALID, f"{path}: no migration from config version {version}")
        data = step(copy.deepcopy(data))
        version = data["version"]
    return data


def _json_path(parts) -> str:
    return "$" + "".join(f"[{p}]" if isinstance(p, int) else f".{p}" for p in parts)


def validate(data: dict, path: Path) -> None:
    validator = Draft202012Validator(load_schema(SUPPORTED_VERSION))
    errors = sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])
    if errors:
        lines = "\n".join(f"  {_json_path(e.absolute_path)}: {e.message}" for e in errors)
        raise ConfigError(EXIT_INVALID, f"{path}: does not match config schema v{SUPPORTED_VERSION}:\n{lines}")


def merge(layers: list[dict]) -> dict:
    """Later layers win: a role list replaces the earlier one; compression merges by key."""
    merged = {"version": SUPPORTED_VERSION, "roles": {}, "compression": dict(DEFAULT_COMPRESSION)}
    for layer in layers:
        merged["roles"].update(layer.get("roles") or {})
        merged["compression"].update(layer.get("compression") or {})
    missing = [role for role in ROLES if role not in merged["roles"]]
    if missing:
        raise ConfigError(
            EXIT_INVALID,
            f"no candidates for role(s): {', '.join(missing)}; add them under 'roles:' in the project or user config",
        )
    return merged


def resolve(cwd: Path, home: Path) -> dict:
    found = {}
    user = user_config_path(home)
    if user.is_file():
        found["user"] = user
    project = project_config_path(cwd, home)
    if project is not None:
        found["project"] = project
    if not found:
        raise ConfigError(
            EXIT_NO_CONFIG,
            f"no config found (looked for {project_target(cwd)} and {user}); run: prism.py init",
        )
    layers = []
    for scope, path in found.items():
        data = load_file(path)
        if file_version(data, path) < SUPPORTED_VERSION:
            validate(upgrade(data, path), path)
            raise ConfigError(
                EXIT_MIGRATE,
                f"{path}: config version {data['version']} needs migration to {SUPPORTED_VERSION}; "
                f"run: prism.py migrate --{scope} --write",
            )
        validate(data, path)
        layers.append(data)
    config = merge(layers)
    config["sources"] = {scope: str(path) for scope, path in found.items()}
    return config


def cmd_check(cwd: Path, home: Path, as_json: bool) -> int:
    config = resolve(cwd, home)
    print(json.dumps(config, indent=2) if as_json else yaml.safe_dump(config, sort_keys=False).rstrip())
    return EXIT_OK


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        print(f"error: {message}", file=sys.stderr)
        raise SystemExit(EXIT_USAGE)


def build_parser() -> argparse.ArgumentParser:
    parser = _Parser(prog="prism.py", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="validate and print the resolved config")
    check.add_argument("--json", action="store_true", help="print JSON instead of YAML")
    return parser


def main(argv: list[str] | None = None, *, cwd: Path | None = None, home: Path | None = None) -> int:
    cwd = Path.cwd() if cwd is None else cwd
    home = Path.home() if home is None else home
    args = build_parser().parse_args(argv)
    try:
        if args.command == "check":
            return cmd_check(cwd, home, args.json)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return exc.code
    return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
```

`shutil` is imported now because Task 3 uses it; leave it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uvx --with pyyaml --with jsonschema pytest tests -q`
Expected: all pass.

- [ ] **Step 5: Run the real script once through uv**

Run: `chmod +x scripts/prism.py && uv run --script scripts/prism.py check; echo "exit=$?"`
Expected: `error: no config found (...)` and `exit=2` (this repo has no config yet).

- [ ] **Step 6: Commit**

```bash
git add scripts/prism.py tests/test_prism.py
git commit -m "Add prism.py check: config discovery, validation, merge"
```

---

### Task 3: `prism.py init` and `migrate`

**Files:**
- Modify: `scripts/prism.py` (add `cmd_init`, `cmd_migrate`, parser entries, dispatch in `main`)
- Test: `tests/test_prism.py` (append)

**Interfaces:**
- Consumes: everything Task 2 produces; `assets/config.template.yaml` placeholder `{{SCHEMA_PATH}}`.
- Produces: `cmd_init(cwd: Path, home: Path, scope: str, force: bool) -> int`, `cmd_migrate(cwd: Path, home: Path, scope: str, write: bool) -> int`; CLI `init [--project|--user] [--force]`, `migrate [--project|--user] [--write]` (scope default `project`). Migrate backups are written next to the file as `<name>.v<old>.bak`.

- [ ] **Step 1: Append the failing tests**

```python
def test_init_project_writes_at_git_root_with_schema_path(env, capsys):
    home, repo = env
    sub = repo / "pkg"
    sub.mkdir()
    code, out, _ = run(["init"], home, sub, capsys)
    assert code == 0
    target = project_cfg(repo)
    assert out.strip() == str(target)
    header = target.read_text(encoding="utf-8").splitlines()[0]
    schema = Path(header.removeprefix(prism.SCHEMA_HEADER))
    assert schema.is_absolute() and schema.is_file()


def test_fresh_scaffold_fails_check_until_filled(env, capsys):
    home, repo = env
    run(["init"], home, repo, capsys)
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert "$.roles.fast" in err


def test_init_refuses_overwrite_without_force(env, capsys):
    home, repo = env
    target = write(project_cfg(repo), full())
    code, _, err = run(["init"], home, repo, capsys)
    assert code == prism.EXIT_USAGE
    assert "--force" in err
    assert yaml.safe_load(target.read_text(encoding="utf-8")) == full()
    code, _, _ = run(["init", "--force"], home, repo, capsys)
    assert code == 0
    assert yaml.safe_load(target.read_text(encoding="utf-8"))["roles"]["fast"] == []


def test_init_user(env, capsys):
    home, repo = env
    code, out, _ = run(["init", "--user"], home, repo, capsys)
    assert code == 0
    assert out.strip() == str(user_cfg(home))


def test_migrate_current_is_noop(env, capsys):
    home, repo = env
    write(project_cfg(repo), full())
    code, out, _ = run(["migrate"], home, repo, capsys)
    assert code == 0
    assert "already at version 1" in out


def test_migrate_missing_config_exits_2(env, capsys):
    home, repo = env
    code, _, _ = run(["migrate", "--user"], home, repo, capsys)
    assert code == prism.EXIT_NO_CONFIG


def test_migrate_dry_run_then_write(env, capsys, v2):
    home, repo = env
    target = write(project_cfg(repo), full())
    original = target.read_text(encoding="utf-8")

    code, out, _ = run(["migrate"], home, repo, capsys)
    assert code == 0
    assert out.startswith(prism.SCHEMA_HEADER)
    assert yaml.safe_load(out)["version"] == 2
    assert target.read_text(encoding="utf-8") == original

    code, out, _ = run(["migrate", "--write"], home, repo, capsys)
    assert code == 0
    backup = target.with_name(target.name + ".v1.bak")
    assert backup.read_text(encoding="utf-8") == original
    assert run(["check"], home, repo, capsys)[0] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uvx --with pyyaml --with jsonschema pytest tests/test_prism.py -q`
Expected: the new tests fail with exit code `1` (argparse rejects `init`/`migrate`).

- [ ] **Step 3: Implement**

Add after `cmd_check`:

```python
def cmd_init(cwd: Path, home: Path, scope: str, force: bool) -> int:
    target = user_config_path(home) if scope == "user" else project_target(cwd)
    if target.exists() and not force:
        raise ConfigError(EXIT_USAGE, f"{target} already exists; edit it, or pass --force to replace it")
    template = (ASSETS / "config.template.yaml").read_text(encoding="utf-8")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(template.replace("{{SCHEMA_PATH}}", str(schema_path(SUPPORTED_VERSION))), encoding="utf-8")
    print(target)
    return EXIT_OK


def cmd_migrate(cwd: Path, home: Path, scope: str, write: bool) -> int:
    path = user_config_path(home) if scope == "user" else project_config_path(cwd, home)
    if path is None or not path.is_file():
        raise ConfigError(EXIT_NO_CONFIG, f"no {scope} config found; nothing to migrate")
    data = load_file(path)
    old = file_version(data, path)
    if old == SUPPORTED_VERSION:
        print(f"{path}: already at version {SUPPORTED_VERSION}")
        return EXIT_OK
    migrated = upgrade(data, path)
    validate(migrated, path)
    text = f"{SCHEMA_HEADER}{schema_path(SUPPORTED_VERSION)}\n{yaml.safe_dump(migrated, sort_keys=False)}"
    if not write:
        print(text, end="")
        return EXIT_OK
    backup = path.with_name(f"{path.name}.v{old}.bak")
    shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")
    print(f"migrated {path} to version {SUPPORTED_VERSION}; previous file saved as {backup}")
    return EXIT_OK
```

In `build_parser`, before `return parser`:

```python
    init = sub.add_parser("init", help="write a config scaffold")
    init.add_argument("--force", action="store_true", help="replace an existing file")
    migrate = sub.add_parser("migrate", help="upgrade a config to the supported version")
    migrate.add_argument("--write", action="store_true", help="write the result (default: print it)")
    for command in (init, migrate):
        scope = command.add_mutually_exclusive_group()
        scope.add_argument("--project", dest="scope", action="store_const", const="project")
        scope.add_argument("--user", dest="scope", action="store_const", const="user")
        command.set_defaults(scope="project")
```

In `main`, inside the `try` after the `check` branch:

```python
        if args.command == "init":
            return cmd_init(cwd, home, args.scope, args.force)
        if args.command == "migrate":
            return cmd_migrate(cwd, home, args.scope, args.write)
```

- [ ] **Step 4: Run all tests**

Run: `uvx --with pyyaml --with jsonschema pytest tests -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/prism.py tests/test_prism.py
git commit -m "Add prism.py init and migrate"
```

---

### Task 4: References — dispatch recipes and model-choice guidance

**Files:**
- Create: `references/dispatch.md`
- Rename + rewrite: `references/benchmarks.md` → `references/choosing-models.md`
- Modify: `docs/skill-discussion.md` (link `../references/benchmarks.md` → `../references/choosing-models.md`, link text "model-choice notes")

**Interfaces:**
- Consumes: CLI facts verified on this machine (below).
- Produces: `references/dispatch.md` and `references/choosing-models.md`, linked from `SKILL.md` in Task 5.

- [ ] **Step 1: Verify CLI flags before writing recipes**

Run and read the output:

```bash
claude --help | grep -E -- '--model|-p,|--print|--effort'
codex exec --help | grep -E -- '--model|-c,|--config'
omp --help | grep -E -- '--model|--thinking|--no-session|-p,'
herdr agent
```

Expected: each flag used in Step 2 appears. If a flag differs (for example `claude` has no `--effort`), write the recipe with what exists and note that effort falls back to the harness default.

- [ ] **Step 2: Write `references/dispatch.md`**

```markdown
# Dispatch recipes

Use the first candidate in the role whose `via` can run in the current environment. Give every worker a self-contained prompt: objective, scope, constraints (including the task's existing authorization and tool limits), and what to return. If a candidate's `effort` is not supported by its harness, omit it, use the harness default, and say so.

## `claude-code`

- **Inside Claude Code:** start a subagent with the Agent tool and set `model` to the candidate's model. Use a read-only agent type (such as Explore) for `fast` gathering when available.
- **From another harness:** `claude -p --model <model> "<prompt>"`. Requires the `claude` CLI and an authenticated account.

## `codex`

- **Inside Codex:** start a native subagent with the candidate's model and reasoning effort.
- **From another harness:** `codex exec --model <model> -c 'model_reasoning_effort="<effort>"' "<prompt>"`.

## `omp`

- **Inside omp:** use a task agent with the model set, or the `smol` (fast) / `slow` (reasoning) roles when they already point at the candidate. Per-agent model overrides live in omp's `task.agentModelOverrides` setting; do not change user settings without asking.
- **From another harness:** `omp -p --no-session --model <model> --thinking <effort> "<prompt>"`.
- OpenRouter models (`openrouter/<vendor>/<model>`) need `OPENROUTER_API_KEY` in the environment. Check that the variable is set; never print its value. If it is missing, skip the candidate and say why.

## `herdr:<kind>`

Use only when the candidate says so and `HERDR_ENV=1`; otherwise skip the candidate. Follow the herdr skill for details.

1. `herdr pane layout --pane "$HERDR_PANE_ID"` to choose `right` (wide pane) or `down`.
2. `herdr pane split --current --direction <right|down> --cwd "$PWD" --no-focus` → read `.result.pane.pane_id`.
3. `herdr agent start <name> --kind <kind> --pane <pane-id> -- <model args>` where `<model args>` are the agent's own flags (for omp: `--model <model> --thinking <effort>`).
4. `herdr agent prompt <name> "<prompt>" --wait --timeout <ms>`.
5. `herdr agent read <name> --source recent --lines 200` for the result.

If the agent reports `blocked`, show the user what it is asking; do not approve on their behalf. Close or release the pane when the work is done unless the user wants to keep it.

## Brief format for `fast` workers

Ask gatherers to return, within `compression.brief_max_words`:

- **Answer:** the direct finding in one or two sentences.
- **Evidence:** `path:line` references or URLs, each with a short quote or one-line summary.
- **Gaps:** what was searched but not found, and open questions.

No raw file dumps or full web pages.
```

- [ ] **Step 3: Rename and restructure the benchmark notes**

```bash
git mv references/benchmarks.md references/choosing-models.md
```

Rewrite the top of `references/choosing-models.md` so the file reads in this order:

1. `# Choosing models for each role` and one paragraph: this file guides writing a config during init; nothing here is a default; candidates live in `.beholdr/prism-mini.config.yaml`.
2. `## fast` criteria: low cost per task, low latency to a checked result, reliable tool calling and instruction following, good long-context reading and faithful summarising; reasoning depth matters less; prefer a model the user can already run (installed harness, existing login or key).
3. `## reasoning` criteria: strongest checked coding and agentic results the user can afford; effort matters as much as model (cite the FrontierCode finding that higher effort did not always score higher); prefer the model the user already drives with for consistency.
4. `## Reading benchmarks`: keep the existing "Limits and review rule" and "Speed is task-dependent" guidance (model *and* effort, harness differences, aggregate vs single task, completion time vs tokens/sec).
5. `## Example candidates (checked 2026-10-05)`: table `Role | Model | via | Effort | Why | Source`, from Step 4. State that examples go stale and are not defaults.
6. `## Evidence (checked 2026-09-29)`: the existing Artificial Analysis, FrontierCode, Terminal-Bench, computer use, and orchestration sections, unchanged except headings demoted one level. Delete the GPT-6.1 Sol "user preference"/"temporary default" sentences; keep the measured numbers.

- [ ] **Step 4: Research current candidates (2026-10-05) and fill the example table**

Research with web search; record source URL and date per row:

- `reasoning`: current top models available in Claude Code, Codex, and on OpenRouter, with the effort that scored best per cost on FrontierCode or a comparable agentic coding benchmark. Re-check whether Astra 6.1 has shipped.
- `fast`: 3–5 cheap, fast models with good tool-calling results (e.g., a function-calling or agentic-retrieval benchmark) and their OpenRouter IDs, plus the cheapest native option in each of Claude Code and Codex.

Each row needs a source. Leave out any model whose claim you could not source.

- [ ] **Step 5: Update the link in `docs/skill-discussion.md`**

Replace both occurrences of `../references/benchmarks.md` with `../references/choosing-models.md` and the link text `benchmark notes` with `model-choice notes`.

- [ ] **Step 6: Check links and commit**

Run: `grep -rn "benchmarks.md" --include=*.md . | grep -v docs/superpowers`
Expected: no output.

```bash
git add references docs/skill-discussion.md
git commit -m "Add dispatch recipes; turn benchmark notes into model-choice guidance"
```

---

### Task 5: Rewrite SKILL.md and README.md

**Files:**
- Modify (full rewrite): `SKILL.md`, `README.md`

**Interfaces:**
- Consumes: `scripts/prism.py` CLI and exit codes (Tasks 2–3), `references/dispatch.md`, `references/choosing-models.md` (Task 4).
- Produces: the skill users load.

- [ ] **Step 1: Write `SKILL.md`**

```markdown
---
name: beholdr-prism-mini
description: Route subagent work by role using a project or user config (.beholdr/prism-mini.config.yaml). Fast models gather context (grep, codebase research, web fetches) and hand condensed briefs to reasoning models. Use when delegating, spawning subagents, choosing a worker model, or setting up model routing (init) across Claude Code, Codex, omp/OpenRouter, or Herdr.
compatibility: Requires Python 3.11+ and uv for scripts/prism.py. Optional codex, omp, or herdr for cross-harness dispatch.
metadata:
  version: "2.0.0"
  config-schema: "1"
---

# Beholdr Prism Mini

Route subagent work to two roles: `fast` models gather context; `reasoning` models write code, make designs, and decide. Which models fill each role comes from a config file, never from this skill or from memory. The user chooses the primary model in their harness settings; this skill only decides which subagents to start, on which model, and how.

An explicit model instruction from the user or the project's instructions takes priority over the config.

## 1. Load the config first

From the project's working directory, run this skill's script (path relative to this skill's directory):

    uv run --script <skill-dir>/scripts/prism.py check --json

| Exit | Meaning | Do |
| --- | --- | --- |
| 0 | Resolved config on stdout | Route with it. |
| 2 | No config | Offer to set one up (section 7). Until then, do not pick models for subagents; ask the user. |
| 3 | Invalid config | Show the errors and offer to fix the file. |
| 4 | Older config version | Show `migrate` output, then run `migrate --write` with the user's approval. |
| 5 | Config newer than skill | Tell the user to update the skill. |

If `uv` is missing or the script cannot run, say so and ask how to proceed. Do not fall back to model names you remember.

## 2. Decide whether to delegate

Follow an explicit request to delegate. Otherwise delegate only when the task can be bounded and the handoff plus review is worthwhile. Keep dependent steps, architecture, integration, and final review with the primary agent. Continuing without a subagent is always an option.

## 3. Compress input with fast workers

When `compression.enabled` is true and the task needs context the primary agent does not already have:

1. Write a gather request: the question, scope (paths, symbols, URLs), and the brief format in [dispatch recipes](references/dispatch.md#brief-format-for-fast-workers).
2. Send it to `fast` candidates. Split independent questions across parallel workers.
3. Work from the briefs. If something is missing, send a narrower follow-up gather instead of reading everything yourself.

Skip gathering when the handoff would cost more than doing it directly, such as one known file or a single grep.

## 4. Delegate reasoning work

Give a `reasoning` worker the objective, constraints, relevant briefs, and completion criteria. Review its result and account for any repairs before calling the delegation successful.

## 5. Dispatch

Use the first candidate in the role whose `via` can run here; recipes are in [dispatch recipes](references/dispatch.md). Use `herdr:<kind>` only when the candidate says so and `HERDR_ENV=1`. Preserve the task's authorization and tool constraints in every handoff.

## 6. Fallback

If no candidate in a role can run, say which candidates were skipped and why, then use the closest capable model available in the current harness and state the substitution. Never silently select a paid route the config does not list. Do not retry the same candidate and effort without a new approach.

## 7. Set up or change the config

1. Ask whether the config is for this project or for the user, then run `prism.py init --project` or `init --user`. Project settings replace the user's per role.
2. Find what can run: installed `claude`, `codex`, `omp`, `herdr`; their model lists (`omp models` includes OpenRouter); which provider key variables are set. Check presence only; never print or store key values.
3. Propose two or three candidates per role using [choosing models](references/choosing-models.md).
4. Show the YAML. Add paid or opt-in routes only with the user's approval.
5. Write the file and run `check` until it exits 0.
```

- [ ] **Step 2: Verify SKILL.md names no models**

Run: `grep -niE 'sol|luna|astra|opus|sonnet|haiku|fable|gpt|gemini' SKILL.md`
Expected: no output.

- [ ] **Step 3: Write `README.md`**

```markdown
# Beholdr Prism Mini

A small skill for routing subagent work by role. Fast, cheap models gather context (grep, codebase research, web fetches) and hand condensed briefs to reasoning models, which do the code, design, and decisions and can ask for more gathering. Which models fill each role comes from a config file, so new models need a config edit, not a skill release.

Works in Claude Code, Codex, and omp, and can dispatch across them, including OpenRouter models through omp and agents in Herdr panes. The larger `beholdr-prism` project holds the experimental router, plugins, hooks, and evaluation work.

## Setup

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

Ask your agent to set up prism-mini routing, or run:

    uv run --script scripts/prism.py init --project   # or --user

Then fill in candidates (the agent can propose them) and validate:

    uv run --script scripts/prism.py check

## Config

Project: `.beholdr/prism-mini.config.yaml` (found from any subdirectory up to the git root). User: `~/.beholdr/prism-mini.config.yaml`. A project role list replaces the user's list for that role; anything the project leaves out is inherited.

    version: 1
    roles:
      fast:
        - model: <model id>
          via: omp            # claude-code | codex | omp | herdr:<kind>
          effort: low
      reasoning:
        - model: <model id>
          via: claude-code
          effort: high
    compression:
      enabled: true
      brief_max_words: 800

Candidates are tried in order. The schema is `assets/config.schema.v1.json`; `init` points your editor at it. Never put API keys in the config.

## Upgrading

The config carries a `version`. When a skill release changes the format, `check` exits 4 and `prism.py migrate --write` upgrades the file, keeping a `.bak` copy.

## More

- [Dispatch recipes](references/dispatch.md) per harness.
- [Choosing models](references/choosing-models.md): selection criteria, dated examples, and benchmark evidence.
- [Earlier discussion](docs/skill-discussion.md) on why the mini skill and the experimental router are separate.
```

- [ ] **Step 4: Validate the skill**

Run: `uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate .`
Expected: valid. If the package path has changed, find the current install command on https://agentskills.io/specification and use it.

- [ ] **Step 5: Commit**

```bash
git add SKILL.md README.md
git commit -m "Rewrite skill for config-driven routing and input compression (2.0.0)"
```

---

### Task 6: Local install and end-to-end checks

**Files:**
- No repo changes unless a check finds a defect (then fix in the owning file, add a test if it is script behaviour, and commit).

- [ ] **Step 1: Ask the user before replacing the installed copy**

Confirm, then run:

```bash
mkdir -p ~/.beholdr/backup
mv ~/.agents/skills/beholdr-prism-mini ~/.beholdr/backup/beholdr-prism-mini-1.x
ln -s /home/can/dev/beholdr-prism-mini ~/.agents/skills/beholdr-prism-mini
ls -la ~/.agents/skills/beholdr-prism-mini ~/.claude/skills/beholdr-prism-mini
```

Expected: both resolve to the repo. The backup sits outside any skills directory so no harness loads it twice.

- [ ] **Step 2: Init dry run in a scratch git repo**

```bash
S=$(mktemp -d) && git -C "$S" init -q && cd "$S"
uv run --script ~/.agents/skills/beholdr-prism-mini/scripts/prism.py init
uv run --script ~/.agents/skills/beholdr-prism-mini/scripts/prism.py check; echo "exit=$?"
```

Expected: file written under `$S/.beholdr/`; `check` exits 3 naming `$.roles.fast` and `$.roles.reasoning`. Fill both roles with models from the Step 3 checks, re-run `check`, expect exit 0.

- [ ] **Step 3: Dispatch spot checks (one short prompt each)**

```bash
claude -p --model haiku "Reply with exactly: OK"
codex exec --model <cheapest model listed by codex> "Reply with exactly: OK"
omp models | head -40      # pick a model from a provider omp is signed in to
omp -p --no-session --model <that model> "Reply with exactly: OK"
```

Expected: each prints `OK`. OpenRouter is skipped until the user's keychain is set up. If not inside Herdr (`HERDR_ENV` unset), record the Herdr recipe as unverified.

- [ ] **Step 4: Skill discovery**

Run: `omp config get skills.enableAgentsUser`
Expected: `true`. In a new Claude Code session, the skill list shows the new description.

- [ ] **Step 5: Full test run and final commit**

Run: `uvx --with pyyaml --with jsonschema pytest tests -q`
Expected: all pass. Commit any fixes from Steps 2–4.
