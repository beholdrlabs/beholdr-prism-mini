---
name: beholdr-prism-mini
description: Route subagent work by role and mode using a project or user config (.beholdr/prism-mini.config.json). Fast workers read large codebases, research the web, or apply mechanical edits, and hand short sourced briefs to the primary model. Use when delegating, spawning subagents, choosing a worker model, generating worker definitions, or setting up model routing (init) in Claude Code, Codex, omp/OpenRouter, or Herdr. Not for small tasks, audits, or reviews.
license: MIT
compatibility: Requires Node.js 22.18+ or Bun for scripts/prism.ts (no packages to install). Optional codex, omp, or herdr for cross-harness dispatch.
metadata:
  version: "2.2.0"
  config-schema: "1"
---

# Beholdr Prism Mini

Route subagent work to two roles: `fast` workers read, research, or apply mechanical edits; `reasoning` models write code, design, and decide. Models come from the config, never from this skill or memory; an explicit model instruction from the user or project overrides the config.

## 1. Load the config

Run on its own, from the project directory (no `echo $?` or other chained commands):

    node --disable-warning=ExperimentalWarning <skill-dir>/scripts/prism.ts check

(`bun <skill-dir>/scripts/prism.ts check` also works.) Exit 0: route with the JSON on stdout. 2: no config; offer setup (section 6) and do not pick models until then. 1: fix the command. 3: show the errors and offer to fix the file. 4: show `migrate`, then `migrate --write` with approval. 5: ask the user to update the skill. If the script cannot run, say so; do not fall back to remembered model names.

## 2. Decide whether to delegate

Delegation pays off when it moves a long reading loop out of the primary and the briefs are much smaller than the reading they replace: every token added to the primary's context is paid at its price, and every primary turn re-reads it.

Do not delegate, even when asked to use this skill: questions answered by a few known files, a single grep, files you have already read, audits, reviews, bug hunts, migrations, irreversible operations, or design decisions. Do the work directly and say in one line why. Keep integration and final review with the primary.

## 3. Choose a mode

| Mode | Use for | Limits (`compression`) |
| --- | --- | --- |
| **reader** (read-only) | Sweeps of large or unfamiliar codebases: more than about five unread files or a few thousand lines | `brief_max_words`, `total_brief_max_words`, `worker_max_tool_calls` |
| **researcher** (read-only) | Web or documentation research needing many searches or pages | `research.*` |
| **editor** (writes) | Mechanical edits across many files, after you make one example change | `worker_max_tool_calls`; you review the diff |

1. Map with one cheap listing (`git ls-files`, `rg --files`) and give two or three workers disjoint scopes.
2. Start every request with the same context block (workers then share a cached prefix), then the question, files or symbols, and the mode's limits. Readers grep for structure, then read only the line ranges they need.
3. Send all requests at once so workers run in parallel.
4. Work from the briefs. Re-open only claims you doubt, and only their cited lines. Fill gaps with a narrower follow-up, never a guess.
5. Report only what a worker returned. If a spawn fails or returns nothing, say so and do the work yourself.

**Brief format:** **Answer** (one or two sentences); **Evidence** (one line per claim: `path:line` or URL, then the quoted line); **Gaps** (searched but not found, open questions). No raw dumps.

For `reasoning` workers, hand over the objective, constraints, relevant briefs, and completion criteria, and review the result before accepting it.

## 4. Dispatch

Use the first candidate in the role whose `via` can run here, and pass its model and effort when spawning.

- **Claude Code:** Agent tool with `subagent_type` `prism-reader`, `prism-researcher`, or `prism-editor` (Explore for reading if they do not exist) and `model` set. Start parallel workers in one message, not in the background.
- **Codex:** spawn `prism_reader`, `prism_researcher`, or `prism_editor` and state the model and reasoning effort in the request; Codex ignores `model` in agent files.
- **Others:** [dispatch recipes](references/dispatch.md). Use `herdr:<kind>` only when the candidate says so and `HERDR_ENV=1`.

Preserve the task's authorization and tool limits in every handoff.

## 5. Fallback

If no candidate can run, say which were skipped and why, use the closest capable model in this harness, and state the substitution. Never select a paid route the config does not list, and do not retry the same candidate without a new approach.

## 6. Set up

1. Ask whether the config is for this project or the user; run `prism.ts init --project` or `--user`. A project role replaces the user's; omit it to inherit.
2. Check what can run: `claude`, `codex`, `omp`, `herdr`, their model lists, and which provider key variables are set (presence only; never print keys).
3. Propose two or three candidates per role from [choosing models](references/choosing-models.md); add paid or opt-in routes only with approval.
4. Write the file and run `check` until it exits 0.
5. Run `prism.ts agents --write` (`--user` writes `~/.claude/agents` and `~/.codex/agents`) to generate the workers. They enforce what instructions cannot: Claude Code workers get tool lists, `maxTurns`, and a read-only Bash guard; Codex workers get a read-only or workspace-write sandbox.
