# Beholdr Prism Mini

A small skill for routing subagent work by role. Fast, cheap models gather context (grep, codebase research, web fetches) and hand condensed briefs to reasoning models, which do the code, design, and decisions and can ask for more gathering. Which models fill each role comes from a config file, so new models need a config edit, not a skill release.

Works in Claude Code, Codex, and omp, and can dispatch across them, including OpenRouter models through omp and agents in Herdr panes. The larger `beholdr-prism` project holds the experimental router, plugins, hooks, and evaluation work.

## Setup

Requires Node.js 22.18+ or Bun. The script has no dependencies, so there is nothing to install.

Ask your agent to set up prism-mini routing, or run:

    node scripts/prism.ts init --project   # or --user; `bun` works too

Then fill in candidates (the agent can propose them) and validate:

    node scripts/prism.ts check

## Config

Project: `.beholdr/prism-mini.config.json` (found from any subdirectory up to the git root). User: `~/.beholdr/prism-mini.config.json`. A project role list replaces the user's list for that role; anything the project leaves out is inherited.

    {
      "$schema": "file:///path/to/beholdr-prism-mini/assets/config.schema.v1.json",
      "version": 1,
      "roles": {
        "fast": [{ "model": "<model id>", "via": "omp", "effort": "low" }],
        "reasoning": [{ "model": "<model id>", "via": "claude-code", "effort": "high" }]
      },
      "compression": { "enabled": true, "brief_max_words": 800 }
    }

`via` is `claude-code`, `codex`, `omp`, or `herdr:<kind>`.

Candidates are tried in order. The schema is `assets/config.schema.v1.json`; `init` sets `$schema` so JSON-aware editors validate the file and show field descriptions on hover. Duplicate keys are rejected. Never put API keys in the config.

## Upgrading

The config carries a `version`. When a skill release changes the format, `check` exits 4 and `prism.ts migrate --write` upgrades the file, keeping a `.bak` copy.

## More

- [Dispatch recipes](references/dispatch.md) per harness.
- [Choosing models](references/choosing-models.md): selection criteria, dated examples, and benchmark evidence.
- [Earlier discussion](docs/skill-discussion.md) on why the mini skill and the experimental router are separate.

## Development

The skill runs `scripts/prism.ts` directly with Node's type stripping or Bun; `package.json` only adds dev tools. Run `bun install` (or `npm install`) once for editor types, then `npm test` or `bun test tests/` and `npm run typecheck`. `scripts/validate.ts` implements the JSON Schema keywords the config schema uses; a test fails if the schema starts using one it does not support.
