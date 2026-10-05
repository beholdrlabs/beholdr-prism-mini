# Choosing models for each role

Use this when writing or revising a config during init. Nothing here is a default: the skill routes only to candidates listed in `.beholdr/prism-mini.config.yaml`. Examples below go stale; check current availability, pricing, and evidence before proposing them.

## `fast`

Fast workers gather: grep, file reads, codebase research, web fetches, and condensed briefs. Prefer:

- Low cost per task and low time to a checked result, including time to first token; long thinking before the first token makes a gatherer slow.
- Reliable tool calling and instruction following, and faithful summaries of long context with accurate `path:line` references.
- A model the user can already run: an installed harness, an existing login, or a key that is already set.

Reasoning depth matters less. A fast model that is weak on long agentic tasks can still be a good gatherer, because the reasoning model does the hard part.

## `reasoning`

Reasoning workers write code, make designs and decisions, and consume briefs. Prefer:

- The strongest checked coding and agentic results the user can afford.
- The right effort, not just the right model: on FrontierCode, several models score as well or better at medium than at higher effort.
- Consistency with the model the user already drives with, so handoffs need less translation.

List a cheaper candidate first and a stronger one after it only if the user is happy to try the cheaper one on bounded work; candidates are tried in order of availability, not escalated automatically.

## Reading benchmarks

Model *and* effort matter; record both. Scores include the agent harness (Codex, Claude Code, Terminus, …), so cross-provider gaps also reflect setup. Aggregate scores are not the chance that one task succeeds. A clear check, cheap repair, and observed results on real tasks are the practical signals.

For speed, compare successful end-to-end time on similar tasks when available. Output tokens per second excludes reasoning before the first answer, tool waits, extra actions, and retries. Client speed modes change latency without changing the model.

Review a config when a model is added, a major benchmark revision appears, or delegated tasks repeatedly contradict a choice. Prefer a few recent, comparable results with date, harness, effort, and task type. Avoid changing a config for a single leaderboard movement.

## Example candidates (checked 2026-10-05)

Illustrative only. Verify identifiers in the target harness (`omp models`, `codex`, `claude`) before writing them.

| Role | Model | via | Effort | Why | Source |
| --- | --- | --- | --- | --- | --- |
| fast | `openrouter/deepseek/deepseek-v4.1-flash` | omp | default | Intelligence Index 39, 213 tokens/s, 1.05 s to first token, $0.27 per index task, Terminal-Bench 4.0 26.8% | [Artificial Analysis](https://artificialanalysis.ai/models/releases/comparisons/deepseek-v4-1-flash-vs-gemini-3-8-flash), [OpenRouter](https://openrouter.ai/collections/tool-calling-models) |
| fast | `openrouter/google/gemini-3.8-flash` | omp | default | Index 41 and 239 tokens/s, but 13.45 s to first token and $1.24 per index task | [Artificial Analysis](https://artificialanalysis.ai/models/releases/comparisons/deepseek-v4-1-flash-vs-gemini-3-8-flash) |
| fast | `openrouter/z-ai/glm-5.3-flash` | omp | default | Among the most-used tool-calling models on OpenRouter; FrontierCode max 31.8 at $1.15 per task | [OpenRouter](https://openrouter.ai/collections/tool-calling-models), [FrontierCode](https://cognition.com/data/frontiercode-leaderboard/data.json) |
| fast | `gpt-6-luna` | codex | medium | Cheapest native Codex option: FrontierCode 35.5 at $0.05 per task; weak on long terminal tasks (9.6%), so keep it to gathering | [FrontierCode](https://cognition.com/data/frontiercode-leaderboard/data.json), [Vals](https://www.vals.ai/models/openai_gpt-6-luna) |
| fast | `claude-haiku-4-5` | claude-code | default | Smallest native Claude Code model; no comparable current benchmark found | [Claude Code model config](https://code.claude.com/docs/en/model-config) |
| reasoning | `claude-opus-5-5` | claude-code | medium | FrontierCode 54.6 at $0.80 per task; high (54.0) and max (54.4) cost more without scoring higher | [FrontierCode](https://cognition.com/data/frontiercode-leaderboard/data.json) |
| reasoning | `claude-sonnet-5-5` | claude-code | high | FrontierCode 49.4 at $0.42; xhigh 52.1 at $1.59 | [FrontierCode](https://cognition.com/data/frontiercode-leaderboard/data.json) |
| reasoning | `gpt-6.1-sol` | codex | medium | FrontierCode 50.2 at $0.36, its best measured effort; xhigh matches GPT-6 Astra high on the Intelligence Index at lower cost | [FrontierCode](https://cognition.com/data/frontiercode-leaderboard/data.json), [Artificial Analysis](https://artificialanalysis.ai/models/releases/gpt-6-1-sol) |
| reasoning | `gpt-6-astra` | codex | high | FrontierCode 50.9 at $3.01; a stronger-but-costlier fallback after Sol | [FrontierCode](https://cognition.com/data/frontiercode-leaderboard/data.json) |

GPT-6.1 Astra will not ship: OpenAI cancelled it on 2026-09-28 after safety and alignment audits ([The Hacker News](https://thehackernews.com/2026/09/openai-shelves-gpt-61-astra-after-tests.html), [Engadget](https://www.engadget.com/2271626/openai-cancels-gpt-6-1-astra-release-deceptive-behavior/)). Claude Fable 5.1 scores no higher than Opus 5.5 on FrontierCode at several times the cost and needs extra credits in some plans; list it only if the user opts in.

OpenRouter routes need `OPENROUTER_API_KEY`. Keep keys in the environment or an OS keychain, never in the config.

## Evidence (checked 2026-09-29; FrontierCode re-checked 2026-10-05)

### Artificial Analysis Intelligence Index

Artificial Analysis's [GPT-6.1 Sol release comparison](https://artificialanalysis.ai/models/releases/gpt-6-1-sol) and [GPT-6 Astra release comparison](https://artificialanalysis.ai/models/releases/gpt-6-astra) report Intelligence Index v4.3.2, a composite of ten evaluations. Costs here are weighted API-equivalent costs per Intelligence Index task, separate from FrontierCode and subscription charges.

| Model | Effort | Intelligence Index | Cost/index task |
| --- | --- | ---: | ---: |
| GPT-6.1 Sol | xhigh | 51 | $0.39 |
| GPT-6.1 Sol | max | 52 | $0.72 |
| GPT-6 Astra | high | 51 | $1.73 |
| GPT-6 Astra | max | 53 | $3.26 |

Sol 6.1 xhigh matches Astra 6 high at lower cost. The aggregate index does not establish equal reliability on each task or directly measure orchestration.

GPT-6.1 Sol supports `low`, `medium`, `high`, `xhigh`, and `max` ([model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol)); it does not support `none` or `minimal`, and tool calling requires the Responses API. Standard pricing per million tokens for prompts up to 272K input tokens is $2 input, $0.10 cached input, and $10 output.

### FrontierCode 1.1

[Cognition's leaderboard and methodology](https://cognition.com/frontiercode) score whether maintainer-written code changes are mergeable. Values below are `main.new_score` from its [public leaderboard data](https://cognition.com/data/frontiercode-leaderboard/data.json), scaled to 0–100. Costs are the leaderboard's API-equivalent average **per benchmark task**, not subscription charges.

| Model | Effort | Score | Cost/task |
| --- | --- | ---: | ---: |
| GPT-6 Luna | medium | 35.53 | $0.05 |
| GPT-6 Luna | max | 42.42 | $0.10 |
| GPT-6 Sol | low | 37.28 | $0.43 |
| GPT-6 Sol | medium | 45.92 | $0.77 |
| GPT-6 Sol | high | 47.70 | $1.04 |
| GPT-6.1 Sol | low | 45.46 | $0.25 |
| GPT-6.1 Sol | medium | 50.23 | $0.36 |
| GPT-6.1 Sol | high | 47.98 | $0.50 |
| GPT-6.1 Sol | xhigh | 49.29 | $0.56 |
| GPT-6.1 Sol | max | 47.57 | $0.85 |
| GPT-6 Astra | high | 50.94 | $3.01 |
| GPT-6 Astra | max | 53.26 | $4.59 |
| Claude Sonnet 5.5 | medium | 36.48 | $0.24 |
| Claude Sonnet 5.5 | high | 49.38 | $0.42 |
| Claude Sonnet 5.5 | xhigh | 52.1 | $1.59 |
| Claude Opus 5.5 | medium | 54.64 | $0.80 |
| Claude Opus 5.5 | high | 54.0 | $1.09 |
| Claude Opus 5.5 | max | 54.43 | $6.19 |
| Gemini 3.8 Flash | medium | 41.2 | $2.60 |
| GLM 5.3 Flash | max | 31.8 | $1.15 |

GPT-6.1 Sol medium beats its own higher efforts in this run; higher effort is not a guaranteed improvement. Sonnet gains sharply from high effort; Opus medium already performs near its max result. These are aggregate scores, not the chance that a given task will succeed. GPT rows used the Codex harness and Claude rows used Claude Code.

### Independent long-task check

[Vals AI Terminal-Bench 4.0](https://www.vals-ai.com/benchmarks/terminal-bench-4), updated 2026-09-27, used the same Terminus 2 harness for 66 long terminal tasks and reports Opus 5.5 at 61.62%, Astra at 57.07%, Sonnet 5.5 at 53.03%, GPT-6 Sol at 34.34%, and [Luna at 9.60%](https://www.vals.ai/models/openai_gpt-6-luna). The Opus run included older-model provider fallbacks on 30 of 198 attempts; counting those as failures lowers its result to 53.54%. No GPT-6.1 Sol result was found there. These scores cannot be combined with FrontierCode's.

### Computer use

[OpenAI's OSWorld 2.0 report](https://openai.com/index/gpt-6-astra/) gives Astra 72.6% partial reward on the v2026.08.08 offline set; its [Sol and Luna report](https://openai.com/index/introducing-gpt-6-sol-and-luna/) gives GPT-6 Sol at xhigh 60.5%. [Anthropic's OSWorld 2.1 report](https://www.anthropic.com/claude-sonnet-5-5) gives Sonnet 5.5 80.1% and Opus 5.5 81.8%. OSWorld 2.1 and 2.0 are different evaluations; do not rank their percentages together. [Vals CUA-bench](https://www.vals.ai/benchmarks/cua_bench) (six video games, one trial each) is weak evidence for office or browser work. Delegate screen-driven work only to a worker with the required computer tools.

### Speed

[Vals' Terminal-Bench 4.0 comparisons](https://www.vals.ai/comparisons/anthropic_claude-opus-5-5-vs-openai_gpt-6-astra) report completion times of 42m02s for Astra and 1h31m for Opus 5.5; the [Sol comparison](https://www.vals.ai/comparisons/anthropic_claude-sonnet-5-5-vs-openai_gpt-6-sol) reports 43m10s for GPT-6 Sol and 2h06m for Sonnet 5.5; the [Luna comparison](https://www.vals.ai/comparisons/kimi_kimi-k3-vs-openai_gpt-6-luna) reports 1h12m for Luna. Luna's lower task cost did not make it the fastest finisher on long tasks.

### Agent orchestration

None of the cited results compare current primary-agent choices head to head; coding and terminal scores include the whole agent setup.

- [ClawArena-Team](https://arxiv.org/abs/2606.31174) tests a lead agent managing a fixed worker pool across 41 scenarios; its tested models predate the current ones.
- [OrchBench](https://arxiv.org/abs/2607.25656) isolates orchestration plans; its central finding is that preserving task-critical information matters more than adding agents. This supports compact, faithful briefs from fast workers.
- [TeamBench](https://teambench.github.io/) shows team benefit varies by task, with more benefit on the hardest tasks.
