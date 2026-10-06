# Is a Prism skill worth building?

Status: brainstorming record, 2026-09-29. A simple first version now exists at [SKILL.md](../SKILL.md). This document records the tradeoffs discussed before it was written; the advanced router remains in the separate `beholdr-prism` project.

Skill 2.0 (2026-10-05) removed built-in model defaults: model choices now live in a versioned `.beholdr/prism-mini.config.yaml` (JSON since 2.0.x), as this discussion recommended. See [model-choice notes](../references/choosing-models.md) for selection guidance and evidence; the discussion below remains a historical record.

## What a skill could accomplish

The original pain is repeated instructions in `AGENTS.md`. A reusable skill could give an agent one workflow for preparing a bounded task, checking available candidates, requesting a model choice, delegating through the current client, and recording what happened.

Its most useful input may be context the host agent already understands: affected components, task boundaries, verification options, ambiguities, tool needs, and the primary agent's remaining responsibilities.

A possible invocation would mean “use Prism's delegation workflow.” No specific command, schema, or automatic trigger has been chosen.

## The case for it

- **Immediate workflow value:** reuse a maintained procedure across repositories.
- **Useful task descriptions:** the host can supply repository-specific context before selection.
- **Native execution:** the workflow can dispatch through supported native agents or CLIs while respecting their actual capabilities.
- **Consistent evidence collection:** remind the host to distinguish worker success from primary-agent repairs and record outcomes.
- **Incremental delivery:** start with the user's explicit routing policy and replace the selector later without changing how the user invokes the workflow.

The current Semantic Router Codex proxy limitation makes native execution especially relevant: its documented setup disables multi-agent namespace tools and hosted web search. A skill-based workflow would still need its own integration validation. [Compatibility documentation](https://vllm-sr.ai/docs/installation/protocol-compatibility/#codex-cli).

## The case against it

- **The current table is short.** Packaging the same few lines may not justify a separate artifact until there is a repeatable procedure behind it.
- **Instructions cannot establish model capability.** “Simple task → Luna” remains a heuristic until evaluated.
- **Activation depends on the host.** A skill does not guarantee interception of every request or enforcement of spending rules.
- **The primary model is already running.** In-session skill use cannot eliminate the inference spent reaching the skill; possible savings occur in later delegation or execution.
- **Delegation has a cost.** Preparing context, starting a worker, transferring results, and reviewing them can outweigh savings on a tiny task. Continuing with the current agent must remain an eligible choice.
- **Native mechanics differ.** Shared concepts still require client-specific handling of delegation, effort, state, credentials, and execution.
- **Self-reported outcomes can be wrong.** Reliable measurement needs artifacts and acceptance evidence beyond the agent saying it succeeded.
- **A service workflow may make it redundant.** If requests already arrive through an application or gateway with complete task metadata, that integration may cover the useful behavior.

## A possible minimum scope

If we build a skill, it should describe this procedure:

1. Identify a bounded task, required capabilities, and acceptance criteria.
2. Read the user's existing policy and the active environment's model/account availability.
3. Ask a deterministic or learned selector for a candidate, explanation, and evidence status, including whether continuing with the current agent is preferable.
4. Dispatch through a supported native agent, CLI, or API path within existing authorization.
5. Record execution failures, acceptance evidence, repairs, usage, and time.
6. Leave architecture, integration, and final audit with the primary agent under the initial policy.

Keep model mappings and spending constraints in configuration. Keep selection logic and evidence storage in tools or a service that can be evaluated independently. A skill may package scripts, but enforcement should be implemented in the executing tool rather than relying on prose compliance.

With missing evidence, report that the decision used a heuristic. Use the user's configured fallback when available; do not silently select an unapproved paid route. The workflow should consume existing authorization and only request new input when genuinely required.

## How to decide

Compare three ways of performing the same delegation workflow:

| Option | What it needs to justify its existence |
| --- | --- |
| Shared instructions or the current `AGENTS.md` section | Sufficient consistency with little maintenance |
| Skill plus a small selector/recorder | Fewer repeated instructions, usable native dispatch, and better outcome records at acceptable overhead |
| Application or gateway integration | Reliable automatic routing with the required client features and acceptable operational cost |

A skill's own evaluation should measure successful activation, correct task context, policy adherence, supported dispatch, complete evidence, and additional latency/tokens. Model-routing quality remains a separate measurement.

## Tentative recommendation

A small skill is plausible as Prism's first user interface, especially for bounded native delegation. Its first claim should be consistent workflow and evidence collection. Improved model choices and savings need measured support.

First settle the workflow and candidate/outcome contract. Then build the smallest skill that performs that workflow if it offers a clear improvement over the existing instructions. Keep Semantic Router, Jev, and Laya as independently evaluated implementation choices.

The decision would move against a skill if ordinary instructions are sufficient, the host cannot dispatch the required candidates, or a gateway already owns the necessary context and execution.
