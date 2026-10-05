#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["jsonschema>=4.18"]
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

from jsonschema import Draft202012Validator

SKILL_DIR = Path(__file__).resolve().parent.parent
ASSETS = SKILL_DIR / "assets"
SUPPORTED_VERSION = 1
ROLES = ("fast", "reasoning")
CONFIG_RELPATH = Path(".beholdr") / "prism-mini.config.json"
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


def _reject_duplicates(pairs: list[tuple[str, object]]) -> dict:
    data = {}
    for key, value in pairs:
        if key in data:
            raise ValueError(f"duplicate key {key!r}")
        data[key] = value
    return data


def load_file(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_reject_duplicates)
    except (OSError, UnicodeDecodeError) as exc:
        raise ConfigError(EXIT_INVALID, f"{path}: cannot read: {exc}") from None
    except ValueError as exc:  # json.JSONDecodeError and duplicate keys
        raise ConfigError(EXIT_INVALID, f"{path}: not valid JSON: {exc}") from None
    if not isinstance(data, dict):
        raise ConfigError(EXIT_INVALID, f"{path}: expected a JSON object with a 'version' key")
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


def _hint(error) -> str:
    if error.validator == "minItems" and list(error.absolute_path)[:1] == ["roles"]:
        return " (add a candidate, or remove the key to inherit this role from the user config)"
    return ""


def validate(data: dict, path: Path) -> None:
    validator = Draft202012Validator(load_schema(SUPPORTED_VERSION))
    errors = sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])
    if errors:
        lines = "\n".join(f"  {_json_path(e.absolute_path)}: {e.message}{_hint(e)}" for e in errors)
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


def _dump(schema_version: int, data: dict) -> str:
    """Serialise a config file with its $schema pointing at the installed schema."""
    body = {"$schema": schema_path(schema_version).as_uri(), **{k: v for k, v in data.items() if k != "$schema"}}
    return json.dumps(body, indent=2) + "\n"


def cmd_check(cwd: Path, home: Path) -> int:
    print(json.dumps(resolve(cwd, home), indent=2))
    return EXIT_OK


def cmd_init(cwd: Path, home: Path, scope: str, force: bool) -> int:
    target = user_config_path(home) if scope == "user" else project_target(cwd)
    if scope == "project" and target == user_config_path(home):
        raise ConfigError(EXIT_USAGE, f"{cwd} is not inside a project; run from a project directory, or use --user")
    if target.exists() and not force:
        raise ConfigError(EXIT_USAGE, f"{target} already exists; edit it, or pass --force to replace it")
    template = (ASSETS / "config.template.json").read_text(encoding="utf-8")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(template.replace("{{SCHEMA_URI}}", schema_path(SUPPORTED_VERSION).as_uri()), encoding="utf-8")
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
    text = _dump(SUPPORTED_VERSION, migrated)
    if not write:
        print(text, end="")
        return EXIT_OK
    backup = path.with_name(f"{path.name}.v{old}.bak")
    shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")
    print(f"migrated {path} to version {SUPPORTED_VERSION}; previous file saved as {backup}")
    return EXIT_OK


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        print(f"error: {message}", file=sys.stderr)
        raise SystemExit(EXIT_USAGE)


def build_parser() -> argparse.ArgumentParser:
    parser = _Parser(prog="prism.py", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="validate and print the resolved config as JSON")
    init = sub.add_parser("init", help="write a config scaffold")
    init.add_argument("--force", action="store_true", help="replace an existing file")
    migrate = sub.add_parser("migrate", help="upgrade a config to the supported version")
    migrate.add_argument("--write", action="store_true", help="write the result (default: print it)")
    for command in (init, migrate):
        scope = command.add_mutually_exclusive_group()
        scope.add_argument("--project", dest="scope", action="store_const", const="project")
        scope.add_argument("--user", dest="scope", action="store_const", const="user")
        command.set_defaults(scope="project")
    return parser


def main(argv: list[str] | None = None, *, cwd: Path | None = None, home: Path | None = None) -> int:
    cwd = Path.cwd() if cwd is None else cwd
    home = Path.home() if home is None else home
    args = build_parser().parse_args(argv)
    try:
        if args.command == "check":
            return cmd_check(cwd, home)
        if args.command == "init":
            return cmd_init(cwd, home, args.scope, args.force)
        if args.command == "migrate":
            return cmd_migrate(cwd, home, args.scope, args.write)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return exc.code
    return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
