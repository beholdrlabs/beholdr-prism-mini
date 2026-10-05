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
