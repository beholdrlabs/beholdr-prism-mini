# Evaluation: does delegated reading pay off?

Status: pilot results, 2026-10-06. One run per cell; see [Limitations](#limitations).
How to rerun: [evals/README.md](../evals/README.md).

## Summary

Handing reading to a cheaper worker **loses money on small tasks and saves
about 40-50% on wide sweeps of a large codebase**, in both Claude Code and
Codex, with the same fact coverage but thinner answers. The cost driver is not
token count but new tokens entering the primary's context and the number of
primary turns over that growing context. A larger worker budget and an output
compression hook did not help.

## Method

| | |
| --- | --- |
| Harnesses | Claude Code 2.1.289 (headless `claude -p`); Codex CLI 0.160 (`codex exec`) |
| Primary models | `claude-opus-5-5` medium; `gpt-6.1-sol` medium |
| Worker models | `claude-haiku-4-5`; `gpt-6-luna` medium |
| Repositories | beholdr-lore at `92a32dc` (about 29k lines, Rust and TypeScript); [payloadcms/payload](https://github.com/payloadcms/payload) at `8001944` (about 453k lines, TypeScript) |
| Isolation | Fresh git worktree per run; MCP servers off |
| Grading | Fact lists written from the code before each task's first run ([lore](../evals/answer-key.md), [Payload](../evals/payload/answer-key.md)); answers graded by Claude, not blind, with distinctive claims checked against the code |
| Cost | Claude Code: reported `total_cost_usd`. Codex: token counts from session rollouts priced at API list rates (Codex subscriptions bill quota instead) |

Each task ran in these groups:

| Group | What it is |
| --- | --- |
| **control** | The primary model alone: no subagents, it reads everything itself |
| **prism** | The same primary with prism-mini; cheaper workers read and return briefs |
| **prism-unlimited** | prism with an effectively unlimited worker budget |
| **hook** | control plus a hook that compresses large tool outputs with Haiku |
| **codex-control**, **codex-prism** | control and prism in Codex |

Except on lore Q1, the prism prompts ask the primary to delegate, so they
measure delegation itself rather than the skill's decision to delegate. Each
group gets the same task prompt; only a one-line routing instruction differs.

Prices used (per million tokens): Opus 5.5 $4 input, $20 output, $0.20 cache
read, $8 one-hour cache write; Haiku 4.5 $1 / $5; Sol 6.1 $2 input, $0.10
cached, $10 output (2x input and 1.5x output above 272k input tokens); Luna
$0.10 input, $0.01 cached, $0.50 output.

## Results

### Repository size

| Task | Repo | control: Opus alone | prism: Opus + Haiku workers | Change |
| --- | --- | ---: | ---: | :---: |
| Q1: API routes and request checks (one file) | lore | $0.30 | $0.34 | +12% |
| Q2: inventory scan locations (four files) | lore | $0.81 | $0.91 | +12% |
| Q4: architecture and use-case diagrams (whole repo) | lore | $0.97 | $0.76 | −22% |
| P1: REST create, end to end (cross-package) | Payload | $1.80 | $0.93 | −48% |

On Q1 the primary loaded the skill and declined to delegate, as the skill
instructs for one known file, so the difference is the skill's overhead. Lore
prism figures are for skill 2.1.0; with 2.0.0, prism cost more than control on every task
($1.01 on Q2, $1.10 on Q4).

### Accuracy

| Task | control | prism | Notes |
| --- | --- | --- | --- |
| Q2, four files (15 facts) | 14.5 | 14.5 | Both missed the built-in plugin rule |
| Q4, whole repo (16 facts) | 16 | 15.5 | prism stated Codex usage reads a file; it spawns `codex app-server` |
| P1, Payload (15 facts) | 15 | 15 | control also found two real bugs; the prism answer was half as long |

Both Opus answers on P1 (control and prism) also claimed that a collection without `access.create`
lets any logged-in user create. Payload's sanitized defaults restrict it to the
admin-user collection; both Sol answers said so. The fact list did not cover
this.

### Where the money goes

| Opus, by token type | Output | Cache writes | Cache reads | Workers | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| lore Q2, control | $0.19 | $0.54 | $0.08 | | $0.81 |
| lore Q2, prism (skill 2.0.0) | $0.19 | $0.60 | $0.06 | $0.16 | $1.01 |
| Payload P1, control (45 primary tool calls) | $0.41 | $0.81 | $0.58 | | $1.80 |
| Payload P1, prism (14 primary tool calls) | $0.22 | $0.38 | $0.12 | $0.22 | $0.93 |

On a small repo, cache writes dominate and delegation adds to them: the skill
text, the briefs, and the primary's spot checks are all new tokens. On a large
repo, the primary alone makes many turns, each re-reading a growing context;
moving that loop into a worker removes most of those reads and writes.

### Worker budget (Payload P1)

| | prism (budget 15) | prism-unlimited |
| --- | ---: | ---: |
| Worker tool calls | 15, 15, 22 | 48, 34, 42 |
| Worker cost | $0.22 | $0.60 |
| Primary spot checks after briefs | 8 | 2 |
| Total | $0.93 | $1.18 |
| Facts | 15 | 14.5 |

Briefs are capped, so three times the reading produced about the same brief.
Misses came from scoping, not from running out of calls.

### Output compression hook (Payload P1)

A `PostToolUse` hook can, according to the Claude Code docs, replace a tool's
output with `updatedToolOutput`. In Claude Code 2.1.289 the hook ran but the
replacement was ignored for built-in tools (`Read`, `Bash`); only
`additionalContext` took effect. The working alternative rewrites the tool
input in `PreToolUse`: large reads are redirected to a Haiku-compressed copy,
and read-only shell commands are run through a compressor.

| | control | hook | prism |
| --- | ---: | ---: | ---: |
| Cost | $1.80 | $1.82 | $0.93 |
| Time | 219 s | 239 s | 171 s |
| Primary tool calls | 45 | 60 | 14 |

The primary already read in small slices, so only two outputs crossed the
12,000-character threshold (34.6k to 4.7k characters, $0.05, about 15 s
each). After a compressed view it went back for exact lines, adding calls. The
hook shrinks individual outputs; the cost is in the number of turns.

### Codex (Payload P1)

| | codex-control: Sol alone | codex-prism: Sol + Luna workers |
| --- | ---: | ---: |
| Cost | $0.60 | $0.36 (−40%) |
| Time | 382 s | 310 s |
| Worker cost | | $0.045 (3 threads, 49 requests) |
| Facts | 15 | 15 |

codex-control also flagged the unconditional rollback, one of the two bugs control found.

## Findings that changed the skill

| Finding | Rule in skill 2.2.0 |
| --- | --- |
| Small tasks and already-read files lose money | Decline them even when asked; say why in one line |
| Briefs drop the detail audits need; control found bugs prism missed | No delegation for audits, reviews, or bug hunts |
| Primary re-read whole files after briefs (2.0.0) | Briefs quote cited lines; re-open only doubted claims, only their lines |
| prism guessed when a brief had a gap (Q4) | Fill gaps with a narrower follow-up, never a guess |
| Workers exceeded prose budgets (22-23 calls for 15) | Generated workers with `maxTurns` (Claude Code) |
| Readers only need to read | Read-only Bash guard (Claude Code); `sandbox_mode = "read-only"` (Codex) |
| Sol reported a worker result after a failed spawn | Report only what a worker returned |
| Codex ignored `model` in agent files; names need underscores | Pass model and effort at spawn; `prism_*` names |
| More budget did not help | Default budget stays at 15, configurable |

## Limitations

- **Single runs.** Two runs of an unchanged Claude Code setup cost $1.80 and $1.52; differences under about 15% may be noise. Codex variance was not measured.
- **Few tasks.** Three lore tasks and one Payload task; read-only questions only.
- **Not blind.** Claude wrote the fact lists and graded the answers knowing the group.
- **Fact lists are incomplete.** The Payload list missed the default-access rule.
- **Untested modes.** The researcher and editor modes have no measurements yet.
- **Versions.** Claude Code 2.1.289 and Codex CLI 0.160; harness behaviour (hooks, agent files, caching) may change.
