# Prism Mini evaluation

Does handing reading to a cheaper worker save money without losing accuracy?
This compares a primary model working alone with the same primary using Prism
Mini, in Claude Code and in Codex, on two repositories.

**Status:** pilots only (one run per cell); the planned 30-run lore evaluation
has not been run. Results: [docs/evaluation.md](../docs/evaluation.md).

## Arms

| Arm | Harness | Primary | Workers | How |
| --- | --- | --- | --- | --- |
| A | Claude Code | `claude-opus-5-5`, medium | none | `--disallowedTools Agent` |
| C | Claude Code | `claude-opus-5-5`, medium | `claude-haiku-4-5` | [config](prism-mini.config.json); prompt asks to delegate (Q1 leaves it to the skill) |
| CU | Claude Code | as C | as C, budget 1000 calls | [config](prism-mini.uncapped.config.json) |
| H | Claude Code | as A | none; [compression hook](experiments/compress-hook.ts) | PreToolUse hook sends large reads through Haiku |
| XA | Codex 0.160 | `gpt-6.1-sol`, medium | none | `-c agents.enabled=false` |
| XC | Codex 0.160 | `gpt-6.1-sol`, medium | `gpt-6-luna`, medium | [config](prism-mini.codex.config.json) plus `prism.ts agents --write` in the worktree |

Every run uses a fresh worktree at a pinned commit, the same task prompt, and
a one-line routing instruction that differs by arm (see [tasks.md](tasks.md)).

## Subjects and tasks

- [beholdr-lore](https://github.com/beholdrlabs/beholdr-lore) at `92a32dc`, about 29k lines of Rust and TypeScript: [tasks](tasks.md), [answer key](answer-key.md).
- [payloadcms/payload](https://github.com/payloadcms/payload) at `8001944`, about 453k lines of TypeScript: [task](payload/tasks.md), [answer key](payload/answer-key.md).

## Running

    ./run.sh <arm> <task-id> <run>                    # lore
    REPO=/path/to/payload PIN=8001944 TASKS=$PWD/payload/tasks.md ./run.sh XC P1 0
    node summarize.ts                                 # one JSON line per run

Results go to `results/` (gitignored; logs contain local paths). Claude Code
costs come from the stream's `total_cost_usd`; hook costs from `hook.jsonl`;
Codex costs from [codex-usage.ts](codex-usage.ts), which sums the run's
session rollouts (subagents included) at API list prices.

## Results

See [docs/evaluation.md](../docs/evaluation.md) for results, cost breakdowns,
findings, and limitations.

## Pilot history

1. Lore Q1: C declined to delegate on a one-file task (correct per the skill) and paid only overhead.
2. Lore Q2: C declined again with "use the skill to route this work". From then on C's prompt explicitly asks it to delegate (Q1 keeps the open wording), and Q2–Q4 became repo-spanning questions.
3. Skill 2.1.0 added worker budgets, quoted evidence, and no-re-read rules after 2.0.0 lost on every task.
4. The first H run was invalid: the hook's guard rejected the primary's compound read commands, so nothing was compressed (kept in `results/invalid/`).

## Rules

- Tasks, answer keys, and metrics are fixed before a task's first run.
- Results are reported whether or not they favour Prism.
- Claims cover these repositories, tasks, model versions, and run counts.
