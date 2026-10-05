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
