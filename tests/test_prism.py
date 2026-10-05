import json
import sys
from pathlib import Path

import pytest

SKILL_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL_DIR / "scripts"))
import prism

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
    path.write_text(data if isinstance(data, str) else json.dumps(data, indent=2), encoding="utf-8")
    return path


def user_cfg(home):
    return home / ".beholdr" / "prism-mini.config.json"


def project_cfg(repo):
    return repo / ".beholdr" / "prism-mini.config.json"


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
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_NO_CONFIG
    assert "init" in err


def test_user_config_only(env, capsys):
    home, repo = env
    write(user_cfg(home), full())
    code, out, _ = run(["check"], home, repo, capsys)
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
    code, out, _ = run(["check"], home, deep, capsys)
    assert code == 0
    assert json.loads(out)["sources"] == {"project": str(project_cfg(repo))}


def test_project_role_replaces_user_role_and_inherits_others(env, capsys):
    home, repo = env
    write(user_cfg(home), full(compression={"brief_max_words": 500}))
    project_fast = [{"model": "project-fast", "via": "codex"}]
    write(project_cfg(repo), {"version": 1, "roles": {"fast": project_fast}, "compression": {"enabled": False}})
    code, out, _ = run(["check"], home, repo, capsys)
    assert code == 0
    data = json.loads(out)
    assert data["roles"] == {"fast": project_fast, "reasoning": REASONING}
    assert data["compression"] == {"enabled": False, "brief_max_words": 500}


def test_project_with_only_compression_inherits_roles(env, capsys):
    home, repo = env
    write(user_cfg(home), full())
    write(project_cfg(repo), {"version": 1, "compression": {"brief_max_words": 300}})
    code, out, _ = run(["check"], home, repo, capsys)
    assert code == 0
    assert json.loads(out)["roles"] == {"fast": FAST, "reasoning": REASONING}


def test_home_cwd_does_not_double_count_user_config(env, capsys):
    home, _ = env
    write(user_cfg(home), full())
    code, out, _ = run(["check"], home, home, capsys)
    assert code == 0
    assert json.loads(out)["sources"] == {"user": str(user_cfg(home))}


def test_non_git_directory_only_checks_cwd(env, capsys):
    home, _ = env
    outside = home / "notes" / "sub"
    outside.mkdir(parents=True)
    write(home / "notes" / ".beholdr" / "prism-mini.config.json", full())
    code, _, _ = run(["check"], home, outside, capsys)
    assert code == prism.EXIT_NO_CONFIG


@pytest.mark.parametrize("text", ["", '{"version": 1,', "[1, 2]"])
def test_malformed_json_exits_3_with_path(env, capsys, text):
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


def test_duplicate_keys_exit_3(env, capsys):
    home, repo = env
    write(project_cfg(repo), '{"version": 1, "version": 2}')
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert "duplicate key 'version'" in err


def test_usage_error_exits_1(env, capsys):
    home, repo = env
    with pytest.raises(SystemExit) as exc:
        prism.main(["bogus"], cwd=repo, home=home)
    assert exc.value.code == prism.EXIT_USAGE


def test_init_project_writes_at_git_root_with_schema_path(env, capsys):
    home, repo = env
    sub = repo / "pkg"
    sub.mkdir()
    code, out, _ = run(["init"], home, sub, capsys)
    assert code == 0
    target = project_cfg(repo)
    assert out.strip() == str(target)
    uri = json.loads(target.read_text(encoding="utf-8"))["$schema"]
    assert uri.startswith("file:///")
    assert Path(uri.removeprefix("file://")).is_file()


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
    assert json.loads(target.read_text(encoding="utf-8")) == full()
    code, _, _ = run(["init", "--force"], home, repo, capsys)
    assert code == 0
    assert json.loads(target.read_text(encoding="utf-8"))["roles"]["fast"] == []


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
    migrated = json.loads(out)
    assert next(iter(migrated)) == "$schema"
    assert migrated["version"] == 2
    assert target.read_text(encoding="utf-8") == original

    code, out, _ = run(["migrate", "--write"], home, repo, capsys)
    assert code == 0
    backup = target.with_name(target.name + ".v1.bak")
    assert backup.read_text(encoding="utf-8") == original
    assert run(["check"], home, repo, capsys)[0] == 0


def test_non_utf8_config_exits_3_without_traceback(env, capsys):
    home, repo = env
    path = project_cfg(repo)
    path.parent.mkdir(parents=True)
    path.write_bytes(b"version: 1\nroles: \xff\n")
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert str(path) in err


def test_unreadable_config_exits_3(env, capsys):
    home, repo = env
    path = write(project_cfg(repo), full())
    path.chmod(0)
    try:
        code, _, err = run(["check"], home, repo, capsys)
    finally:
        path.chmod(0o644)
    assert code == prism.EXIT_INVALID
    assert str(path) in err


def test_empty_role_error_explains_inheritance(env, capsys):
    home, repo = env
    write(user_cfg(home), full())
    write(project_cfg(repo), {"version": 1, "roles": {"fast": [], "reasoning": REASONING}})
    code, _, err = run(["check"], home, repo, capsys)
    assert code == prism.EXIT_INVALID
    assert "remove the key to inherit" in err


def test_init_project_outside_project_refuses_to_touch_user_file(env, capsys):
    home, _ = env
    user = write(user_cfg(home), full())
    code, _, err = run(["init", "--project", "--force"], home, home, capsys)
    assert code == prism.EXIT_USAGE
    assert "--user" in err
    assert json.loads(user.read_text(encoding="utf-8")) == full()
