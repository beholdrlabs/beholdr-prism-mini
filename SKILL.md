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
| 1 | Usage error (bad arguments, file already exists, not inside a project) | Read the message and correct the command. |
| 3 | Invalid or unreadable config | Show the errors and offer to fix the file. Do not route until `check` exits 0. |
| 4 | Older config version | Show `migrate` output, then run `migrate --write` with the user's approval. |
| 5 | Config newer than skill | Tell the user to update the skill. Do not route until then. |

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

1. Ask whether the config is for this project or for the user, then run `prism.py init --project` or `init --user`. Project settings replace the user's per role; delete a role's key from the project file to inherit it.
2. Find what can run: installed `claude`, `codex`, `omp`, `herdr`; their model lists (`omp models` includes OpenRouter); which provider key variables are set. Check presence only; never print or store key values.
3. Propose two or three candidates per role using [choosing models](references/choosing-models.md).
4. Show the YAML. Add paid or opt-in routes only with the user's approval.
5. Write the file and run `check` until it exits 0.
