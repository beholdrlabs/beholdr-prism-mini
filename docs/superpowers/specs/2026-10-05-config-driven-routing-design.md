# Config-driven routing and input compression

Status: approved design, 2026-10-05. Supersedes the hard-coded model defaults in skill 1.x.

## Goal

Keep `beholdr-prism-mini` a lightweight, instruction-first skill, but move every model choice out of the skill and into a versioned config file. The skill describes *how* to route subagent work; the config says *which* models fill each role. New models then require a config edit, not a skill release.

The skill gains one routing pattern, **input compression**: fast models gather context and hand condensed briefs to reasoning models, which can request narrower follow-up gathering.

Plugins, hooks, mods, and learned decision models (Jev-style) stay in the separate `beholdr-prism` project.

## Non-goals

- Choosing the primary (driver) model. The user picks it in their harness settings; the skill only routes subagents.
- Built-in model defaults. Skill 2.0 ships none.
- Enforcing spend or routing outside the agent's own compliance. Enforcement belongs to `beholdr-prism`.

## Roles

Two roles:

- `fast` — gathering: grep, file reads, codebase research, web fetches, mechanical summaries. Optimised for cost, latency, and reliable tool calling.
- `reasoning` — anything that produces code, designs, or decisions, plus consuming briefs. Lower effort on a reasoning candidate covers bounded work.

A third `worker` tier was considered and dropped: users prefer reasoning models for code output.

## Config file

### Location and precedence

1. Project: `.beholdr/prism-mini.config.yaml`, searched from the working directory up to the git root.
2. User: `~/.beholdr/prism-mini.config.yaml`.

Either may exist alone. When both exist they merge:

- `roles.<role>`: a project list **replaces** the user list for that role; roles the project omits are inherited.
- `compression`: shallow key merge, project wins.
- Both files must declare a `version`; each is validated and migrated independently before merging.

### Schema v1

```yaml
# yaml-language-server: $schema=<skill-repo-raw-url>/assets/config.schema.v1.json
version: 1

roles:
  fast:
    - model: openrouter/<vendor>/<model>
      via: omp
      effort: low
      notes: optional free text
  reasoning:
    - model: claude-opus-5-5
      via: claude-code
      effort: high

compression:
  enabled: true
  brief_max_words: 800
```

| Field | Type | Rule |
| --- | --- | --- |
| `version` | integer | Required. `1` for this schema. |
| `roles` | object | Required after merge. Only `fast` and `reasoning` keys allowed. |
| `roles.<role>` | array | 1+ candidates, in preference order. |
| `model` | string | Required. Identifier as the `via` harness understands it. |
| `via` | string | Required. `claude-code`, `codex`, `omp`, or `herdr:<kind>` where `<kind>` is a Herdr agent kind. |
| `effort` | string | Optional. One of `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Unsupported values are the harness's concern; the agent falls back to the harness default and says so. |
| `notes` | string | Optional. Human context (cost, opt-in reason). |
| `compression.enabled` | boolean | Default `true`. |
| `compression.brief_max_words` | integer | Default `800`, minimum `100`. |

Unknown top-level keys are rejected so typos surface. The config never holds secrets: no API keys or tokens. Keys stay in the environment or an OS keychain, and the schema has no field for them. The schema ships as JSON Schema (draft 2020-12) at `assets/config.schema.v1.json`. `init` writes the header comment with the **absolute path of the installed schema file**, so YAML-aware editors validate locally with no public URL. A published URL can replace it once the repo is public.

### Versioning and migration

- `SKILL.md` frontmatter `metadata.config-schema` declares the config version this skill release expects (`"1"`).
- `prism.py` holds an ordered map of migrations `N -> N+1`. v1 ships with none; tests cover the mechanism with a fixture migration.
- A config older than supported → `check` reports it and suggests `migrate`. A config newer than supported → `check` tells the user to update the skill.

## `scripts/prism.py`

Single file, run with `uv run --script scripts/prism.py …` from the skill directory. Inline script metadata declares `pyyaml` and `jsonschema`. Python 3.11+.

| Command | Behaviour |
| --- | --- |
| `init [--project \| --user] [--force]` | Copies `assets/config.template.yaml` to the chosen location (default `--project`). Refuses to overwrite without `--force`. Prints the path. |
| `check [--json]` | Discovers, validates, migrates in memory, merges, and prints the resolved config (JSON with `--json`). |
| `migrate [--project \| --user] [--write]` | Applies pending migrations; prints the result, writes only with `--write`. |

`check` exit codes: `0` valid, `2` no config found, `3` invalid (errors name the file and JSON path), `4` migration needed, `5` config newer than skill. Error text says what to do next.

## Skill workflow (SKILL.md)

1. **Load config.** Run `check --json`. On `2`, offer init; on `4`, offer migrate; on `3`/`5`, report and stop routing. Never invent candidates.
2. **Decide whether to delegate.** Keep the existing rules: follow explicit requests; otherwise delegate only bounded work whose handoff and review are worthwhile; keep dependent steps with the primary agent.
3. **Compress input** when `compression.enabled` and the task needs gathering the primary agent does not already have:
   - Primary writes a gather request: question, scope (paths, URLs, symbols), and what to return.
   - One or more `fast` workers return a **brief**: findings, `file:line` references, short quotes, open questions, and what was not found; no raw dumps; within `brief_max_words`.
   - The reasoning agent works from the brief and asks for a narrower follow-up gather rather than reading everything itself.
   - Skip when the handoff would cost more than doing it directly.
4. **Delegate reasoning work** to a `reasoning` candidate with objective, constraints, context, and completion criteria. The primary agent reviews the result and accounts for repairs.
5. **Dispatch** to the first candidate whose `via` can run here (see `references/dispatch.md`).
6. **Fallback.** If no candidate in a role can run, say so and use the closest capable model available in the current harness. Never silently select an unlisted paid route.

## Dispatch (`references/dispatch.md`)

| `via` | Recipe |
| --- | --- |
| `claude-code` | Inside Claude Code: Agent tool with `model`. Elsewhere: `claude -p --model <model>` with a self-contained prompt. |
| `codex` | Inside Codex: native subagent with model and reasoning effort. Elsewhere: `codex exec --model <model> -c 'model_reasoning_effort="<effort>"'`. |
| `omp` | Inside omp: task agent, or the `smol`/`slow` roles. Elsewhere: `omp -p --no-session --model <model> --thinking <effort> "<prompt>"`. OpenRouter models need `OPENROUTER_API_KEY`. |
| `herdr:<kind>` | Only when `HERDR_ENV=1`. Split a sibling pane (`herdr pane split --current --no-focus --cwd "$PWD"`), `herdr agent start <name> --kind <kind> --pane <id> -- <model args>`, `herdr agent prompt <name> "<task>" --wait`, then `herdr agent read`. Follow the herdr skill's rules; do not answer blocked approval prompts without the user. |

Preserve the task's authorization and tool constraints in every handoff. Herdr is an explicit `via` choice, never an automatic fallback.

omp discovers this skill from `~/.agents/skills` by default (`skills.enableAgentsUser`), so it needs no extra installation.

## Init flow (agent-guided)

1. Run `prism.py init` (project or user, as the user prefers).
2. Discover what is runnable: installed harnesses (`claude`, `codex`, `omp`, `herdr`), their model lists (`omp models` covers OpenRouter and other providers), and which provider key variables are set — check presence only, never print values.
3. Propose 2–3 candidates per role using `references/choosing-models.md`.
4. Show the YAML; add paid or opt-in routes only with user approval.
5. Write the file and run `check`.

## References

- `references/choosing-models.md` replaces `references/benchmarks.md`: selection criteria per role, how to read benchmarks (model *and* effort, harness effects, aggregate vs task), and **dated example candidates** refreshed during implementation (2026-10). Examples are illustrative, not defaults.
- `references/dispatch.md` as above.

## Frontmatter

Portable Agent Skills fields only, so Codex and omp accept the skill:

```yaml
name: beholdr-prism-mini
description: Route subagent work by role using a project or user config (.beholdr/prism-mini.config.yaml). Fast models gather context (grep, codebase research, web fetches) and hand condensed briefs to reasoning models. Use when delegating, spawning subagents, choosing a worker model, or setting up model routing (init) across Claude Code, Codex, omp/OpenRouter, or Herdr.
compatibility: Requires Python 3.11+ and uv for scripts/prism.py. Optional codex, omp, or herdr for cross-harness dispatch.
metadata:
  version: "2.0.0"
  config-schema: "1"
```

Skill 2.0.0 marks the breaking removal of built-in defaults.

## Repository layout

```
SKILL.md
README.md
scripts/prism.py
assets/config.template.yaml
assets/config.schema.v1.json
references/dispatch.md
references/choosing-models.md
tests/test_prism.py
docs/skill-discussion.md
docs/superpowers/specs/2026-10-05-config-driven-routing-design.md
```

`SKILL.md` stays well under 500 lines; references are one level deep.

## Testing

- `tests/test_prism.py` (pytest via `uv run`): discovery and precedence, per-role merge, schema errors with paths, exit codes, migration chaining with a fixture migration, init overwrite refusal.
- `skills-ref validate .` for frontmatter and naming.
- Manual: init dry run on this machine; one dispatch spot-check each for `claude-code`, `codex exec`, `omp -p` with a provider omp is already signed in to, and Herdr when run inside a Herdr pane. OpenRouter dispatch is deferred until the user has an OS keychain set up for API keys.

## Local rollout

The skill is tested privately in the user's own repos before the repo goes public.

- The installed copy at `~/.agents/skills/beholdr-prism-mini` (read by omp, and by Claude Code through `~/.claude/skills/beholdr-prism-mini`) is currently a plain copy of 1.x. Replace it with a symlink to this repo so every harness picks up changes live; keep the old copy as a backup until 2.0 is accepted.
- Start with project configs in one or two repos; add the user-level config once routing behaves.
- Record issues found in real use before publishing, then switch the schema header to a public URL.

## Open risks

- Agents may skip `check` and route from memory; the description and step 1 must make loading the config the first action.
- `effort` vocabularies differ per harness; the skill reports when it drops an unsupported value.
- `uv` may be missing; `check` failure must degrade to "report and ask", not silent default routing.
