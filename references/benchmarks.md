# Benchmark notes for the mini skill

Checked 2026-09-29. These results inform the routing defaults in [SKILL.md](../SKILL.md). Update this note when revising the policy; the skill does not query benchmarks during a task.

## GPT-6.1 Sol update

OpenAI's [2026-09-29 release notes](https://learn.chatgpt.com/docs/changelog) and [current model guidance](https://developers.openai.com/api/docs/guides/latest-model) recommend GPT-6.1 Sol for complex work at lower cost than Astra. By the user's preference, the skill now uses `gpt-6.1-sol` for both the Sol tier and the former Astra 6 defaults, with xhigh for primary-agent and difficult work. Astra 6 high remains a fallback when checked Sol results remain inadequate. Revisit the policy when Astra 6.1 is released and available; verify its identifier, efforts, and evidence before selecting it. This is a temporary routing preference, not a measured orchestration ranking.

The [model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) supports `low`, `medium`, `high`, `xhigh`, and `max`, with medium as the API default. It does not support `none` or `minimal`; tool calling requires the Responses API. Standard pricing per million tokens for prompts up to 272K input tokens is $2 input, $0.10 cached input, and $10 output. Benchmark task costs below are a separate measurement.

Check [client and account availability](https://learn.chatgpt.com/docs/models) before selecting it. During rollout, use GPT-6 Sol at the same supported effort for bounded work or GPT-6 Astra high for primary-agent and difficult work as a stated availability fallback. Historical GPT-6 Sol results below remain labeled with the model actually evaluated.

## Artificial Analysis Intelligence Index

Artificial Analysis's [GPT-6.1 Sol release comparison](https://artificialanalysis.ai/models/releases/gpt-6-1-sol) and [GPT-6 Astra release comparison](https://artificialanalysis.ai/models/releases/gpt-6-astra), checked 2026-09-29, report Intelligence Index v4.3.2, a composite of ten evaluations. Costs here are weighted API-equivalent costs per Intelligence Index task, separate from FrontierCode and subscription charges.

| Model | Effort | Intelligence Index | Cost/index task |
| --- | --- | ---: | ---: |
| GPT-6.1 Sol | xhigh | 51 | $0.39 |
| GPT-6.1 Sol | max | 52 | $0.72 |
| GPT-6 Astra | high | 51 | $1.73 |
| GPT-6 Astra | max | 53 | $3.26 |

Sol 6.1 xhigh matches the index score of the former Astra 6 high default at lower cost; at max, the models are one point apart. This supports the user's choice to try Sol 6.1 in the Astra role for now. The aggregate index does not establish equal reliability on each task or directly measure primary-agent orchestration. The choice of xhigh for difficult work follows this broader comparison and the user's preference, while bounded coding retains medium based on FrontierCode.

## FrontierCode 1.1

[Cognition's leaderboard and methodology](https://cognition.com/frontiercode) score whether maintainer-written code changes are mergeable. Values below are the `main.new_score` from its [public leaderboard data](https://cognition.com/data/frontiercode-leaderboard/data.json), scaled to 0–100. Costs are the leaderboard's API-equivalent average **per benchmark task**, not Codex or Claude Code subscription charges.

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
| Claude Opus 5.5 | medium | 54.64 | $0.80 |
| Claude Opus 5.5 | max | 54.43 | $6.19 |

The GPT-6.1 Sol rows come from `v1_1.data["GPT-6.1 Sol"][effort].main` in the public data. Medium scored 50.23 at $0.36 per task, compared with GPT-6 Sol medium's 45.92 at $0.77 and Astra high's 50.94 at $3.01. This supports carrying bounded coding to Sol 6.1 medium. High, xhigh, and max scored below medium in this run; higher effort is not a guaranteed improvement, and the small score gap with Astra is not proof of equivalent capability.

The comparison supports Luna max as a low-cost *trial* for checkable code and Sol 6.1 medium for bounded coding. Astra's higher score keeps it a plausible fallback if checked Sol results are inadequate, while the user's temporary difficult-work default is Sol 6.1 xhigh. Sonnet gains sharply from high effort on this benchmark; Opus medium already performs near its max result. These are aggregate scores, not the chance that a given task will succeed. The GPT rows used the Codex harness and Claude rows used Claude Code, so cross-provider differences also include the agent setup.

## Independent long-task check

[Vals AI Terminal-Bench 4.0](https://www.vals-ai.com/benchmarks/terminal-bench-4), updated 2026-09-27, used the same Terminus 2 harness for 66 long terminal tasks and reports Opus 5.5 at 61.62%, Astra at 57.07%, Sonnet 5.5 at 53.03%, Sol at 34.34%, and [Luna at 9.60%](https://www.vals.ai/models/openai_gpt-6-luna). The Opus run included older-model provider fallbacks on 30 of 198 attempts; counting those as failures lowers its result to 53.54%. This benchmark supports reserving stronger models for long, difficult work, but its scores cannot be combined with FrontierCode's.

That Sol result is GPT-6 Sol. No GPT-6.1 Sol result was found in the cited Terminal-Bench leaderboard during this review; the older result does not establish the new model's long-task performance.

## Computer use

[OpenAI's OSWorld 2.0 report](https://openai.com/index/gpt-6-astra/) gives Astra 72.6% partial reward on the v2026.08.08 offline set. Its [Sol and Luna report](https://openai.com/index/introducing-gpt-6-sol-and-luna/) gives Sol at xhigh effort 60.5% on that set and says Luna at max effort exceeds GPT-5.6 Sol at medium effort without publishing Luna's score in the article. OpenAI also reports roughly 40 minutes per task for Astra versus 75 minutes for **GPT-5.6** Sol in latency simulations; that timing is not a comparison with GPT-6 Sol.

[Anthropic's OSWorld 2.1 report](https://www.anthropic.com/claude-sonnet-5-5) gives Sonnet 5.5 80.1% and Opus 5.5 81.8% partial reward. OSWorld 2.1 and OpenAI's OSWorld 2.0 offline results are different evaluations, so their percentages should not be ranked together. The [OSWorld 2.0 authors](https://osworld-v2.xlang.ai/) describe long workflows with many actions, state tracking, and visual precision; this is evidence about screen-driven work, not frontend code or graphic design.

[Vals CUA-bench](https://www.vals.ai/benchmarks/cua_bench) tests screen, keyboard, and mouse control in six video games. Astra scored 19.17% versus Opus 5.5's 14.00% in the [published comparison](https://www.vals.ai/comparisons/anthropic_claude-opus-5-5-vs-openai_gpt-6-astra). Game play and one trial per game make this weak evidence for office or browser tasks. These results informed the earlier Astra-or-Opus default for ambiguous, multi-step computer use; they do not compare Sol 6.1 against Astra.

The published Sol percentages above measure GPT-6 Sol. Using GPT-6.1 Sol follows OpenAI's current computer-use guidance and the user's temporary preference to replace Astra 6 defaults: medium for short, checkable flows and xhigh for longer, ambiguous ones. Those older percentages are not scores for the new model. Validate the changed routing on checked real tasks, with Astra 6 high available as a fallback.

## Speed is task-dependent

[Vals' Terminal-Bench 4.0 comparisons](https://www.vals.ai/comparisons/anthropic_claude-opus-5-5-vs-openai_gpt-6-astra) report benchmark completion time of 42m02s for Astra and 1h31m for Opus 5.5; the [Sol comparison](https://www.vals.ai/comparisons/anthropic_claude-sonnet-5-5-vs-openai_gpt-6-sol) reports 43m10s for Sol and 2h06m for Sonnet 5.5, while the [Luna comparison](https://www.vals.ai/comparisons/kimi_kimi-k3-vs-openai_gpt-6-luna) reports 1h12m for Luna. These are long terminal tasks in one harness, not general response-time guarantees. Luna's smaller model and much lower task cost did not make it the fastest finisher there.

For routing, compare successful end-to-end time on similar tasks when it is available. Output-token speed excludes reasoning before the first answer, tool waits, extra actions, and retries. Client speed modes can change latency without changing the model; they are separate from this skill's model choice.

The Sol timing above is for GPT-6 Sol. Measure GPT-6.1 Sol separately before making a completion-time claim about it.

## Agent orchestration

Orchestration has its own benchmarks, but none of the cited results compare `gpt-6.1-sol` xhigh, `gpt-6-astra` high, and Opus 5.5 high as primary agents in the same setup. Coding and terminal task scores include the whole agent setup and cannot isolate the primary model's skill at delegation.

- [ClawArena-Team](https://arxiv.org/abs/2606.31174) directly tests a lead agent managing a fixed worker pool across 41 scenarios with staged updates. It scores task correctness together with worker access and modality routing. Its tested models predate the user's current choices.
- [OrchBench](https://arxiv.org/abs/2607.25656) isolates the orchestration plan with simulated task dependencies, context limits, and agent budgets. Its simulation scores correlate with Claude Code execution quality (`r=0.816`), and its central finding is that preserving task-critical information matters more than adding agents. It evaluates plans, not the current primary-model choices head to head.
- [TeamBench](https://teambench.github.io/) compares solo work with an enforced Planner–Executor–Verifier team. Team benefit varies by task; its reference pool shows little average uplift, with more benefit on the hardest tasks. Its published leaderboard uses older models and a fixed three-role workflow.

Use GPT-6.1 Sol xhigh for all Codex main-driver work and Opus 5.5 high for Claude Code by the user's preference. For delegation, carry the critical constraints into each handoff and use workers where their work can proceed independently. Revisit the main-driver choice when Astra 6.1 is released and available, comparable orchestration results appear, or repeated real tasks show a different outcome.

## Limits and review rule

Coding benchmarks do not establish the best model for documentation, graphics, or UI. Those entries in the skill are the user's preferences. Benchmarks also cannot tell in advance whether Luna and Sol will do equally well on one specific task. A clear check, cheap repair, and the worker's observed result are the practical signals for trying Luna and escalating.

Review the policy when a model is added, a major benchmark revision appears, or actual delegated tasks repeatedly contradict a default. Prefer a few recent, comparable results and record the date, harness, effort, and task type. Avoid changing the mapping for a single leaderboard movement.

GPT-6.1 Sol's coding results now inform the bounded-worker default. Its primary-agent effort and computer-use routing remain starting heuristics; validate those choices on comparable tasks without transferring GPT-6 Sol's older scores or timings to the new model.
