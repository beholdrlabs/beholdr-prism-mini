# Answer key (beholdr-lore @ 92a32dc)

Required facts are scored as covered or missing. A claim contradicting any
fact below, or the code, counts as wrong.

## Q1. Local API surface (10 facts)

Source: `src/local_api/mod.rs`.

1. Binds `127.0.0.1` only; default port `43187`; `--port PORT` overrides (`:63`, `:69-74`, `src/main.rs:120-128`).
2. `GET /` returns the HTML page with the session token injected (`:168-171`).
3. `/api/usage` returns the usage snapshot; `/api/storage` returns the storage snapshot (`:172-175`, `:192-195`).
4. `/api/inventory` returns the inventory snapshot; optional `X-Lore-Project` header selects a project (`:176-191`).
5. `/api/projects/discover` requires `X-Lore-Project` as the parent folder (`:196-210`).
6. `/api/version/openai-plugin` reads `X-Lore-Plugin`; returns 503 if the publisher version is unavailable (`:211-229`).
7. Embedded static UI assets are also served (`:164-166`).
8. `Host` must equal `127.0.0.1:<port>`, and `Origin` (if present) must match, else 403; `Sec-Fetch-Site` other than `same-origin`/`none` gives 403 (`:343-355`).
9. Non-`GET` gives 405; `Transfer-Encoding` or a non-zero `Content-Length` gives 400; unknown path gives 404; duplicate checked headers give 400 (`:356-374`, `:50-61`).
10. `/api/*` requires `X-Lore-Session` equal to the session token, else 403 (`:375-380`).

Bonus (not required): 8 KB / 64-line header limits, 3 s header timeout, 16 connections, CSP and `X-Frame-Options: DENY` on every response.

## Q2. Inventory sources (15 facts)

Paths below use `CODEX_HOME`, `AGENTS_HOME`, `~/.claude` (the `.claude`
directory next to the Claude config), and `<dir>` for each project search
directory (fact 2).

1. Roots: `CODEX_HOME` (default `~/.codex`), `AGENTS_HOME` (default `~/.agents`), and the Claude config `~/.claude.json`; home is `HOME`, or `USERPROFILE` first on Windows (`src/inventory.rs:24-47`, `src/adapters/claude_inventory.rs:300-305`).
2. Project search directories are the project and its ancestors up to the nearest one containing `.git`; with no `.git` ancestor, only the project itself (`src/inventory.rs:481-497`).
3. Codex MCP servers: `CODEX_HOME/config.toml` (user) and `<project>/.codex/config.toml` (project) (`src/adapters/codex_inventory.rs:60-70`).
4. Codex skills: `AGENTS_HOME/skills`, `CODEX_HOME/skills`, `CODEX_HOME/skills/.system` (user) and `<dir>/.agents/skills` (project) (`:171-200`).
5. Codex plugins: `CODEX_HOME/plugins` plus marketplaces at `AGENTS_HOME/plugins/marketplace.json` and `<dir>/.agents/plugins/marketplace.json`; plugins under `plugins/.system` count as built-in (`:279-300`, `:397`).
6. Codex hooks: `hooks.json` and `config.toml` in `CODEX_HOME` (user) and `<dir>/.codex` (project) (`:536-560`).
7. Codex subagents: `CODEX_HOME/agents`, `<dir>/.codex/agents`; instruction files: `AGENTS.override.md`, `AGENTS.md`, and configured fallback names in `CODEX_HOME` and each `<dir>` (`:767-779`, `:845-860`).
8. Claude MCP servers: `mcpServers` in `~/.claude.json` (user), its `projects[<project path>].mcpServers` (local), and `<project>/.mcp.json` (project) (`src/adapters/claude_inventory.rs:87-130`).
9. Claude skills and commands: `~/.claude/{skills,commands}` (user) and `<dir>/.claude/{skills,commands}` (project) (`:307-325`).
10. Claude plugins: registry `~/.claude/plugins/installed_plugins.json`; enabled state from `~/.claude/settings.json` and `<dir>/.claude/settings.json` / `settings.local.json` (`:392-415`).
11. Claude hooks: `~/.claude/settings.json` (user), `<dir>/.claude/settings.json` (project), `<dir>/.claude/settings.local.json` (local), plus enabled plugins' `hooks/hooks.json` and `plugin.json` hooks (`:651-695`).
12. Claude subagents: `~/.claude/agents`, `<dir>/.claude/agents`; instruction files: `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`, and per `<dir>` `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` (`:743-755`, `:807-841`).
13. Plugins also contribute skills, MCP servers, and hooks: plugin collectors run after plugin discovery for both agents (`src/inventory.rs:236-277`).
14. Desktop apps: macOS uses `HOME` and `/Applications` (`ChatGPT.app`, `Claude.app`, `~/Library/Application Support/Claude`); Windows uses `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` and app packages; other platforms (including Linux) report no desktop items (`src/adapters/desktop_inventory.rs:49-72`, `:195-220`).
15. Failure handling and names: missing files or directories are skipped; unreadable or invalid files add an `InventoryWarning { source_path, message }` (for example "invalid JSON configuration") and the scan continues (`src/inventory.rs:470-479`, `src/adapters/claude_inventory.rs:143-158`). Every item name passes through `safe_inventory_name`, which replaces names over 128 characters, with `://`, line breaks, or secret-like text (`bearer `, `authorization`, `token=`, `api_key=`, `password=`, `sk-`, `ghp_`, ...) with `[redacted]` (`src/inventory.rs:327-349`, `:396-416`).

## Q3. Usage reading end to end (11 facts)

1. Entry point is `collect_usage`, which coalesces calls within 30 s using a process-wide cache (`src/query.rs:72`, `:82-107`).
2. `collect_usage_uncached` runs the Codex and Claude adapters on parallel scoped threads; a panicking adapter becomes an unavailable provider (`src/query.rs:109-122`).
3. Codex: spawns `codex app-server` and speaks JSON-RPC over stdio (`initialize`, `initialized`, `account/read`, `account/rateLimits/read`) with a 15 s timeout; any failure yields `Unavailable` with a reason (`src/adapters/codex_usage.rs:12`, `:15-31`, `:79-93`).
4. Claude: reads subscription OAuth credentials (macOS keychain, else `.credentials.json` under `CLAUDE_CONFIG_DIR` or `~/.claude`); a set `ANTHROPIC_API_KEY` means unsupported auth (`src/adapters/claude_usage.rs:165-171`, `:228-282`).
5. Claude then calls `GET https://api.anthropic.com/api/oauth/usage` with the bearer token, 10 s timeout (`:24`, `:28`, `:173-180`).
6. Claude caching: refresh at most every 300 s on success, backoff up to 900 s on failure, last good reading served as stale for up to 24 h, cache reset when credentials change or disappear (`:26-30`, `:45-87`).
7. Desktop: Tauri command `usage_snapshot` runs `collect_usage` via `spawn_blocking` (`desktop/src-tauri/src/lib.rs:20-25`), called by the desktop transport `usage: () => invoke("usage_snapshot")` (`desktop/src/main.ts:33`).
8. Browser: `GET /api/usage` serializes `collect_usage()` (`src/local_api/mod.rs:172-175`); the web transport calls it with `X-Lore-Session` (`web/app.ts:4`, `:10`).
9. Shared UI: `usageTask` (a `refreshTask`) calls `transport.usage()` only while the window is visible and the Overview is shown, every `preferences.usageMinutes` (default 5) (`ui/app.ts:245-251`, `ui/preferences.ts:13`).
10. Rendering: `renderOverview` maps the snapshot through `providerCards` (grouping by account), then `withFreshness`, then `overview.update`; the overview draws cards with `providerOverviewCard` / `providerTrayBlock` (`ui/app.ts:159-164`, `ui/model.ts:174`, `ui/overview.ts:4`, `ui/usage.ts:22`, `:82`).
11. Failure and age: a failed refresh keeps previous readings and shows "Usage refresh failed · showing previous readings" (or "Usage unavailable · Lore will retry automatically" with none) and marks providers stale; `withFreshness` marks a reading stale when a reported reset has passed or it is more than 15 minutes old (`ui/app.ts:249`, `:162`, `ui/model.ts:388-394`).

## Q4. Architecture and use-case diagrams (16 facts)

Both diagrams must be valid Mermaid (render without errors). Extra correct
components or use cases are fine; an edge or use case that does not exist
counts as a wrong claim.

Architecture (10):

1. A shared Rust library (`src/lib.rs`) used by three front ends: the `lore` CLI (`src/main.rs`), the Tauri desktop app (`desktop/src-tauri/src/lib.rs`), and the local HTTP server (`src/local_api/mod.rs`).
2. Inventory: `src/inventory.rs` with Codex, Claude, and desktop adapters reading agent config files on disk (`src/adapters/*_inventory.rs`), plus findings (`src/inventory_findings.rs`: missing path, duplicate, shadowed, update).
3. Usage: `src/query.rs` with `codex_usage` (spawns `codex app-server`) and `claude_usage` (Anthropic OAuth usage API, credentials from keychain or `.credentials.json`).
4. Storage readings: `src/storage.rs` measures known tool folders on disk.
5. History and activity in SQLite (`.beholdr/beholdr.sqlite3`) via `src/store.rs` / `src/history_store.rs`; written only by explicit history scans and Codex imports.
6. Codex session import (`src/adapters/codex_session.rs`) reads `~/.codex/sessions` JSONL; `src/activity_export.rs` writes export bundles to a folder.
7. Version check (`src/version_check.rs`) fetches from GitHub `openai/plugins`.
8. WSL bridge (`src/wsl_bridge.rs`) runs `wsl.exe` to inventory a Linux distribution from Windows.
9. The desktop app calls the core through Tauri commands; the browser view calls `lore serve` over HTTP on `127.0.0.1` with a session token.
10. Both front ends render the same shared UI (`ui/`) through the `AppTransport` interface (`ui/app.ts:15-21`), with web/desktop entry points in `web/app.ts` and `desktop/src/main.ts`; the desktop app adds a tray popup.

Use cases (6):

11. Actor: the developer (user). External systems (Codex app-server, Anthropic API, GitHub, WSL) may appear as secondary actors.
12. Check remaining subscription capacity for Codex and Claude (Overview / tray, `lore usage`).
13. Browse inventory by agent and project, and review findings (missing, duplicate, shadowed, update available), including checking a plugin's published version.
14. Manage projects: add folders, discover projects under a folder, scan per-project inventory.
15. See local storage use by tool (`lore storage`, Storage tab), and change settings (theme, refresh intervals, hidden agents).
16. Record, list, and diff history snapshots; import a Codex session and export an activity bundle; open the browser view (`lore serve`); inspect a WSL distribution (desktop on Windows).

## T1. `lore list --json` (acceptance)

1. `cargo test` passes.
2. `lore list --json` prints a valid JSON array; each element has `run_id`, `status`, `agent_name`, `model`, `started_at`.
3. `lore list` without the flag prints the same tab-separated output as before.
4. A new integration test in `tests/` runs the binary with `--json` and parses the output.
5. Scope: changes are limited to `src/main.rs`, `src/store.rs` (for example deriving `Serialize` on `RunRow`), and `tests/`. Other touched files are recorded as scope drift.
