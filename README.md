# Beholdr Prism Mini

A small, instruction-only skill for choosing a primary or worker model and reasoning effort. It uses GPT-6.1 Sol xhigh as the Codex main driver, including work previously assigned to Astra 6, and Opus 5.5 high as the usual Claude Code main driver. It adjusts worker coding choices using published benchmark results. The primary agent keeps architecture decisions, integration, and final audit.

Use [the skill](SKILL.md) when choosing a main driver or a model for a bounded delegated task. It needs no benchmark API, local classifier, service, or model call. [Benchmark notes](references/benchmarks.md) record the evidence and its limits, including orchestration benchmarks; they only need review when updating the defaults. The separate `beholdr-prism` project holds the experimental router and broader evaluation work.

The key adjustment is that model *and* effort matter. Luna at max effort is a reasonable first try for isolated code that is easy to verify and repair. GPT-6.1 Sol at medium effort is the default for bounded work with more ambiguity; try high when the task needs more depth. Medium scored highest among its measured FrontierCode efforts, so increasing effort is not a guaranteed improvement. Sol 6.1 at xhigh effort handles difficult work, with max available for exceptional depth and Astra 6 high as a fallback when checked Sol results remain inadequate. For Claude Code, Sonnet at high effort handles bounded coding and Opus at medium effort handles the harder reasoning and coding tasks. These are starting choices, not promises of equal performance on any particular task.

For screen-driven work, the skill uses GPT-6.1 Sol medium or Sonnet for a short, checkable flow and Sol 6.1 xhigh or Opus for a longer, ambiguous one. It treats speed as time to a checked result, including tool use and retries. The [benchmark notes](references/benchmarks.md) distinguish the new model's coding and Intelligence Index results from the older GPT-6 Sol computer-use and timing results.

Sol 6.1 temporarily fills both Sol and Astra 6 roles by the user's preference. Its xhigh Intelligence Index score matches Astra 6 high at a lower benchmark task cost. Revisit the policy when Astra 6.1 is released and available; verify its model identifier, supported efforts, and current evidence before selecting it.

## Use

Ask Codex to use `$beholdr-prism-mini` when choosing a main driver or worker. An explicit model instruction from you or the project takes priority. The skill considers whether delegation helps, checks model availability in the active client, and leaves final review with the primary agent.

The active Sol model is `gpt-6.1-sol`. If it is unavailable during rollout, the skill falls back to `gpt-6-sol` at the same supported effort for bounded work or `gpt-6-astra` high for primary-agent and difficult work, and reports that choice. GPT-6.1 Sol supports low through max effort; `none` and `minimal` are unsupported. See [OpenAI's model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and [Codex availability](https://learn.chatgpt.com/docs/models).

## Workflow documentation

- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) covers per-agent model and reasoning choices.
- [Codex developer commands](https://learn.chatgpt.com/docs/developer-commands) covers `codex exec --model` for a CLI fallback.
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config) covers model availability and effort levels.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) covers model and effort choices for workers.
- [Earlier discussion](docs/skill-discussion.md) records why the simple skill and experimental router live separately.
