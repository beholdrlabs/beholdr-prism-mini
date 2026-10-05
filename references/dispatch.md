# Dispatch recipes

Use the first candidate in the role whose `via` can run in the current environment. Give every worker a self-contained prompt: objective, scope, constraints (including the task's existing authorization and tool limits), and what to return. If a candidate's `effort` is not supported by its harness, omit it, use the harness default, and say so.

## `claude-code`

- **Inside Claude Code:** start a subagent with the Agent tool and set `model` to the candidate's model. Use a read-only agent type (such as Explore) for `fast` gathering when available.
- **From another harness:** `claude -p --model <model> --effort <effort> "<prompt>"`. Requires the `claude` CLI and an authenticated account.

## `codex`

- **Inside Codex:** start a native subagent with the candidate's model and reasoning effort.
- **From another harness:** `codex exec --model <model> -c 'model_reasoning_effort="<effort>"' "<prompt>"`.

## `omp`

- **Inside omp:** use a task agent with the model set, or the `smol` (fast) / `slow` (reasoning) roles when they already point at the candidate. Per-agent model overrides live in omp's `task.agentModelOverrides` setting; do not change user settings without asking.
- **From another harness:** `omp -p --no-session --model <model> --thinking <effort> "<prompt>"`. omp calls effort `none` `off`. A model without tool support fails with "does not support tools"; skip it for gathering, or pass `--no-tools` only for pure text work.
- OpenRouter models (`openrouter/<vendor>/<model>`) need `OPENROUTER_API_KEY` in the environment. Check that the variable is set; never print its value. If it is missing, skip the candidate and say why.

## `herdr:<kind>`

Use only when the candidate says so and `HERDR_ENV=1`; otherwise skip the candidate. Follow the herdr skill for details.

1. `herdr pane layout --pane "$HERDR_PANE_ID"` to choose `right` (wide pane) or `down`.
2. `herdr pane split --current --direction <right|down> --cwd "$PWD" --no-focus` → read `.result.pane.pane_id`.
3. `herdr agent start <name> --kind <kind> --pane <pane-id> -- <model args>` where `<model args>` are the agent's own flags (for omp: `--model <model> --thinking <effort>`).
4. `herdr agent prompt <name> "<prompt>" --wait --timeout <ms>`.
5. `herdr agent read <name> --source recent --lines 200` for the result.

If the agent reports `blocked`, show the user what it is asking; do not approve on their behalf. Close or release the pane when the work is done unless the user wants to keep it.

## Brief format for `fast` workers

Ask gatherers to return, within `compression.brief_max_words`:

- **Answer:** the direct finding in one or two sentences.
- **Evidence:** `path:line` references or URLs, each with a short quote or one-line summary.
- **Gaps:** what was searched but not found, and open questions.

No raw file dumps or full web pages.
