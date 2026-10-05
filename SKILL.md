---
name: beholdr-prism-mini
description: Choose a primary or worker model and reasoning effort using the user's Codex and Claude Code preferences and benchmark-informed task routing. Use for deciding whether to delegate, or selecting a worker model.
---

# Beholdr Prism Mini

Use these defaults for a practical primary or worker choice. Follow an explicit model choice from the user or applicable project instructions first. Work within the active client; do not switch providers just because another model has a higher benchmark score. Sol below means `gpt-6.1-sol`; keep `gpt-6-sol` as a fallback for bounded work and `gpt-6-astra` for primary-agent and difficult work during rollout.

## Choose the main driver

For Codex brainstorming and primary-agent work, use `gpt-6.1-sol` at xhigh effort, including broad architecture, several workstreams, and difficult integration. The user prefers Sol 6.1 in the former Astra 6 role for now; revisit that choice when Astra 6.1 is released and available. In Claude Code, use Opus 5.5 at high effort for brainstorming and as the usual primary agent. Current orchestration benchmarks do not rank these exact model-and-effort combinations. The primary agent owns task breakdown, critical context, integration, and final review.

## Decide whether to delegate

Follow an explicit request to delegate. Otherwise delegate only when the task can be bounded and the handoff plus review is worthwhile. Give the worker an objective, relevant constraints, enough task context, and completion criteria. Keep dependent steps with the primary agent when coordination would outweigh parallel work.

## Route by task and ability to check the result

| Task | Codex default | Claude Code default |
| --- | --- | --- |
| Short docs, mechanical edits, simple scans, or tiny refactors | `gpt-6-luna` at low or medium effort | Sonnet 5.5 at low or medium effort |
| Small, isolated code change with a clear check and cheap repair | Try `gpt-6-luna` at max effort | Sonnet 5.5 at high effort |
| Bounded coding or analysis with ambiguity or a weak check | `gpt-6.1-sol` at medium effort; high if tricky | Sonnet 5.5 at high effort |
| Short, repeatable browser or desktop flow with a visible completion check | `gpt-6.1-sol` at medium effort | Sonnet 5.5 at high effort |
| Multi-step computer use with visual ambiguity or state across apps | `gpt-6.1-sol` at xhigh effort | Opus 5.5 at medium effort |
| Difficult cross-file implementation, deep investigation, architecture, graphics, or UI | `gpt-6.1-sol` at xhigh effort | Opus 5.5 at medium effort |

Use more capable routing when a mistake would be costly to detect or repair. If a Luna attempt fails its check or reveals hidden complexity, move to Sol. If a bounded Sol task stalls or exposes broad design choices, use Sol at high or xhigh effort or return the decision to the primary agent. For the hardest Codex work, consider Sol at max effort when the extra depth is worth the time. If a checked Sol result remains inadequate after a different approach, consider `gpt-6-astra` at high effort as a fallback. Do not repeatedly retry the same model and effort without a new approach.

For browser or desktop work, delegate only to a worker with access to the required computer tools. When turnaround time matters, judge expected task completion time and likely retries, not output tokens per second or model size alone.

These are heuristics, not predicted success rates. FrontierCode supports Sol 6.1 medium for bounded coding and Luna max as a cheap trial. Higher Sol effort did not improve that aggregate coding score; judge the checked result. Artificial Analysis reports the same Intelligence Index score for Sol 6.1 xhigh and Astra 6 high, supporting the user's temporary Sol preference for difficult work. That aggregate comparison does not establish equal reliability on every task. The older computer-use scores measure Sol 6; the Sol 6.1 browser defaults follow current OpenAI guidance and the user's preference. See [benchmark notes](references/benchmarks.md) when revising the defaults.

Claude Fable requires extra credits in the user's setup, so leave it out unless the user explicitly opts in. Use a supported effort if the client offers one; otherwise keep the model choice and let the client use its default effort. GPT-6.1 Sol does not support `none` or `minimal` effort.

Use the active client's native agent tools when available. If a selected Codex model is missing there and Codex CLI is available, use `codex exec --model <model> -c 'model_reasoning_effort="<effort>"'` with a self-contained task prompt. If `gpt-6.1-sol` is unavailable, use `gpt-6-sol` at the same supported effort for bounded work or `gpt-6-astra` at high effort for primary-agent and difficult work, when available, and state the fallback. If the selected model and named fallbacks are unavailable, choose the closest capable model in the same client and state the fallback. Preserve the task's existing authorization and tool constraints. Review the worker's result and account for repairs before calling the delegation successful.
