# Prism Mini evaluation

Does handing reading to a cheaper worker save money without losing accuracy?
This compares a primary model working alone with the same primary using Prism
Mini, in Claude Code and in Codex, on two repositories.

**Status:** pilots only (one run per cell). The planned 30-run lore evaluation
has not been run. Two runs of the same setup cost $1.80 and $1.52, so treat
single-run differences under about 15% as noise.

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

## Results so far

Answers were graded against the answer keys by Claude, not blind.

| Task | A | C | CU | H | XA | XC |
| --- | --- | --- | --- | --- | --- | --- |
| lore Q1, one file | $0.30 | $0.34 (declined) | | | | |
| lore Q2, four files | $0.81, 14.5/15 | $0.91, 14.5/15 | | | | |
| lore Q4, whole repo | $0.97, 16/16 | $0.76, 15.5/16 | | | | |
| Payload P1 | $1.80, 15/15 | $0.93, 15/15 | $1.18, 14.5/15 | $1.82 | $0.60, 15/15 | $0.36, 15/15 |

Lore C figures are for skill 2.1.0; with 2.0.0, C cost more than A on every
task. Payload times: A 219 s, C 171 s, CU 203 s, H 239 s, XA 382 s, XC 310 s.

Findings:

- Cache writes, not tokens, drive Claude Code cost: two-thirds of Opus's bill on lore Q2. Delegation pays when it removes many primary turns over a growing context, so savings grow with repository size.
- Delegated answers are thinner. On Payload, A also found two real bugs; C found none.
- A larger worker budget tripled worker cost without better answers.
- `PostToolUse` `updatedToolOutput` was ignored for built-in tools in Claude Code 2.1.289. Rewriting input instead works, but compression rarely triggered and made the primary read more (H).
- Codex: agent names allow only underscores, `model` in agent files is ignored (pass it at spawn), and `codex exec --ephemeral` breaks subagents. Sol once reported a worker result after a failed spawn.
- The Payload key missed that collections default to admin-only create access; both Sol answers said so, both Opus answers did not.

## Pilot history

1. Lore Q1: C declined to delegate on a one-file task (correct per the skill) and paid only overhead.
2. Lore Q2: C declined again with "use the skill to route this work". From then on C's prompt explicitly asks it to delegate (Q1 keeps the open wording), and Q2–Q4 became repo-spanning questions.
3. Skill 2.1.0 added worker budgets, quoted evidence, and no-re-read rules after 2.0.0 lost on every task.
4. The first H run was invalid: the hook's guard rejected the primary's compound read commands, so nothing was compressed (kept in `results/invalid/`).

## Rules

- Tasks, answer keys, and metrics are fixed before a task's first run.
- Results are reported whether or not they favour Prism.
- Claims cover these repositories, tasks, model versions, and run counts.
