# Tasks

Each run sends one task prompt followed by the arm's routing line.

**Arm A routing line:** `Work directly; do not start subagents.`

**Arm C routing line:**

- Q1 (narrow control, tests the skill's own judgment): `Use the beholdr-prism-mini skill to route this work.`
- Q2, Q3, Q4, T1 (explicit delegation): `Use the beholdr-prism-mini skill to delegate the gathering to fast workers.`

All answers must cite `path:line` for each claim.

## Q1. Local API surface

> In this repository, what HTTP routes does `lore serve` expose, and what
> checks does the server apply to a request before it handles a route? List
> each route with the data it returns and any request headers it reads, then
> list each check with the HTTP status it produces when it fails.

## Q2. Inventory sources (broad)

> For each agent that `lore inventory` covers (Codex, Claude Code, and the
> desktop apps), list where the scan looks for each item type (MCP servers,
> skills, plugins, hooks, subagents, instruction files), separating user-level
> from project-level locations, and name the environment variables that change
> those locations. Then explain how the scan decides which directories count as
> the project, how it handles missing, unreadable, or invalid files, and what
> it does to item names before returning them.

## Q3. Usage reading end to end (broad)

> Trace one subscription-usage reading from where it is obtained to where it is
> drawn on screen, in both the desktop app and the browser view. Cover how the
> Codex and Claude readings are obtained, every cache or refresh interval along
> the way, the Tauri command and HTTP route involved, the shared UI functions
> that turn the snapshot into what is displayed, and what the user sees when a
> reading fails or is old.

## Q4. Architecture and use-case diagrams (broad)

> Produce two Mermaid diagrams of the whole project. First, an architecture
> diagram showing its components (Rust core modules, the CLI, the local HTTP
> server, the desktop app, the browser view, the shared UI), the external
> systems and local data it reads or writes, and the data flow between them.
> Second, a use-case diagram showing the actors and everything they can do with
> the project. After each diagram, list the source files that support each
> component or use case.

## T1. Change: `lore list --json`

> Add a `--json` flag to `lore list` that prints the runs as a JSON array
> instead of the tab-separated table. Keep the existing table output unchanged
> when the flag is absent. Add an integration test under `tests/`. Run
> `cargo test` and report the result.
