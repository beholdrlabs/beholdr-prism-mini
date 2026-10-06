# Beholdr Prism Mini

A small skill for routing subagent work by role and mode. Fast, cheap workers read large codebases, research the web, or apply mechanical edits, and hand short sourced briefs to the primary model, which keeps the design, decisions, and review. Which models fill each role comes from a config file, so new models need a config edit, not a skill release.

It is deliberately conservative: delegation pays off on wide sweeps of large codebases and loses money on small tasks, so the skill declines those.

Tested in Claude Code and Codex. Recipes for omp (including OpenRouter models) and Herdr panes are documented but untested. The larger `beholdr-prism` project holds the experimental router, plugins, and hooks.

## Does it pay off?

Pilot results, one run per cell, primary working alone versus with cheaper readers through the skill:

| Task | Repo size | Claude Code: Opus alone → with Haiku | Codex: Sol alone → with Luna |
| --- | ---: | --- | --- |
| One file | 29k lines | $0.30 → $0.34 (+12%, declined to delegate) | |
| Four files | 29k lines | $0.81 → $0.91 (+12%) | |
| Whole repo | 29k lines | $0.97 → $0.76 (−22%) | |
| Cross-package trace | 453k lines | $1.80 → $0.93 (−48%) | $0.60 → $0.36 (−40%) |

- **Same facts, less depth.** Fact coverage matched, but on the large repo the primary working alone also found two real bugs; the delegated answers were shorter.
- **Count dollars, not tokens.** With prompt caching, cost follows new tokens in the primary's context and the number of primary turns. Delegation wins when it moves a long reading loop out of the primary.
- **What didn't help:** an unlimited worker budget (+27% cost, no better answers) and a hook that compresses tool output (no saving; the primary read more).

Details, cost breakdowns, and limitations: [docs/evaluation.md](docs/evaluation.md).

## Setup

Requires Node.js 22.18+ or Bun. The script has no dependencies, so there is nothing to install.

Ask your agent to set up prism-mini routing, or run:

    node scripts/prism.ts init --project   # or --user; `bun` works too

Then fill in candidates (the agent can propose them), validate, and generate the worker definitions:

    node scripts/prism.ts check
    node scripts/prism.ts agents --write   # or --user; prints them without --write

`agents` writes `prism-reader`, `prism-researcher`, and `prism-editor` for Claude Code (`.claude/agents/*.md`, with tool lists, `maxTurns`, and a read-only Bash guard) and `prism_reader`, `prism_researcher`, and `prism_editor` for Codex (`.codex/agents/*.toml`, with read-only or workspace-write sandboxes). The Claude Code guard is referenced by absolute path, so prefer `--user` over committing project agent files.

## Config

Project: `.beholdr/prism-mini.config.json` (found from any subdirectory up to the git root). User: `~/.beholdr/prism-mini.config.json`. A project role list replaces the user's list for that role; anything the project leaves out is inherited.

    {
      "$schema": "file:///path/to/beholdr-prism-mini/assets/config.schema.v1.json",
      "version": 1,
      "roles": {
        "fast": [{ "model": "<model id>", "via": "omp", "effort": "low" }],
        "reasoning": [{ "model": "<model id>", "via": "claude-code", "effort": "high" }]
      },
      "compression": {
        "enabled": true,
        "brief_max_words": 800,
        "total_brief_max_words": 2000,
        "worker_max_tool_calls": 15,
        "research": { "brief_max_words": 2000, "total_brief_max_words": 5000, "worker_max_tool_calls": 30 }
      }
    }

`via` is `claude-code`, `codex`, `omp`, or `herdr:<kind>`. The `compression` values above are the defaults; `research` applies to the researcher mode.

Candidates are tried in order. The schema is `assets/config.schema.v1.json`; `init` sets `$schema` so JSON-aware editors validate the file and show field descriptions on hover. Duplicate keys are rejected. Never put API keys in the config.

## Upgrading

The config carries a `version`. When a skill release changes the format, `check` exits 4 and `prism.ts migrate --write` upgrades the file, keeping a `.bak` copy.

## More

- [Dispatch recipes](references/dispatch.md) per harness.
- [Choosing models](references/choosing-models.md): selection criteria, dated examples, and benchmark evidence.
- [Evaluation results](docs/evaluation.md) and [harness](evals/README.md): tasks, answer keys, and scripts for the Claude Code and Codex comparisons.
- [Earlier discussion](docs/skill-discussion.md) on why the mini skill and the experimental router are separate.

## Development

The skill runs `scripts/prism.ts` directly with Node's type stripping or Bun; `package.json` only adds dev tools. Run `bun install` (or `npm install`) once for editor types, then `npm test` or `bun test tests/` and `npm run typecheck`. `scripts/readonly-guard.ts` is the read-only Bash hook for Claude Code workers. `scripts/validate.ts` implements the JSON Schema keywords the config schema uses; a test fails if the schema starts using one it does not support.
