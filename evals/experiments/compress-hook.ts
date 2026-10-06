#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
// Experimental PreToolUse hook: compress large reads with a fast model before
// the primary model sees them. Claude Code ignores PostToolUse
// `updatedToolOutput` for built-in tools, so this rewrites tool input instead:
//
//   Read (no offset/limit, large file) -> Read of a compressed copy
//   simple read-only Bash command      -> `run` mode: execute, then compress if large
//
// Hook mode:  compress-hook.ts            (hook JSON on stdin)
// Run mode:   compress-hook.ts run <command-b64> <task-file>
// Env: PRISM_HOOK_MODEL (default claude-haiku-4-5), PRISM_HOOK_MIN_CHARS
// (default 12000), PRISM_HOOK_LOG (JSONL log path; optional).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = process.env.PRISM_HOOK_MODEL ?? "claude-haiku-4-5";
const MIN_CHARS = Number(process.env.PRISM_HOOK_MIN_CHARS ?? 12000);
const CACHE = join(tmpdir(), "prism-hook");
const SELF = fileURLToPath(import.meta.url);
// Each segment of a command chain must be one of these read-only commands.
const READ_ONLY = [
  /^cd(\s+\S+)?$/,
  /^echo(\s|$)/,
  /^(cat|grep|rg|head|tail|nl|wc|ls)(\s|$)/,
  /^sed -n '?\d+(,\d+)?p'?(\s|$)/,
  /^find\s(?!.*\s-(exec|execdir|delete|ok|fprint|fls)\b)/,
  /^git (grep|ls-files|log|show|diff|blame)(\s|$)/,
];

/** Read-only command chains: every segment allow-listed; no substitution or redirection. */
function isReadOnly(command: string): boolean {
  const unquoted = command.replace(/'[^']*'|"[^"$`\\]*"/g, "''");
  if (/[`$<>(){}\n\\]/.test(unquoted)) return false;
  const segments = unquoted.split(/&&|\|\||[;|]/).map((segment) => segment.trim()).filter(Boolean);
  // Map quoted placeholders back to the original segment text for pattern checks.
  const originals = command.split(/&&|\|\||[;|](?=(?:[^'"]|'[^']*'|"[^"]*")*$)/).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 && segments.length === originals.length
    && originals.every((segment) => READ_ONLY.some((pattern) => pattern.test(segment)));
}

const SYSTEM = `You compress tool output for a coding agent working on the task below.
Keep only what helps with the task. Rules:
- Quote kept source lines verbatim, prefixed with their line number as "L<n>: " when line numbers are given.
- Collapse irrelevant regions into one line each: "L<a>-<b>: <what is there, in a few words>".
- Always keep definitions (functions, classes, types, routes, exports) with their line numbers, and every line that mentions terms from the task.
- Never invent or paraphrase code. Aim for at most a quarter of the input length.`;

function log(entry: Record<string, unknown>): void {
  if (process.env.PRISM_HOOK_LOG) appendFileSync(process.env.PRISM_HOOK_LOG, JSON.stringify(entry) + "\n");
}

/** The task: first user message plus the primary's latest text, from the transcript. */
function taskContext(transcriptPath: string | undefined): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  let first = "";
  let latest = "";
  for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
    if (!line) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const content = entry.message?.content;
    const text = typeof content === "string" ? content
      : Array.isArray(content) ? content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") : "";
    if (!text) continue;
    if (entry.type === "user" && !first) first = text;
    if (entry.type === "assistant") latest = text;
  }
  return `Task: ${first.slice(0, 2000)}\nAgent's latest note: ${latest.slice(-600)}`;
}

function compress(label: string, body: string, task: string): string | null {
  const started = Date.now();
  const run = spawnSync("claude", [
    "-p", "--model", MODEL, "--tools", "", "--strict-mcp-config", "--no-session-persistence",
    "--setting-sources", "", "--output-format", "json", "--system-prompt", `${SYSTEM}\n\n${task}`,
  ], { input: `${label}\n\n${body}`, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PRISM_HOOK_NESTED: "1" } });
  let result: any = null;
  try { result = JSON.parse(run.stdout); } catch { /* fall through */ }
  const text: string | undefined = result?.result;
  log({ label, before_chars: body.length, after_chars: text?.length ?? null, cost_usd: result?.total_cost_usd ?? null,
    ms: Date.now() - started, model: MODEL, ok: Boolean(text && !result?.is_error) });
  if (!text || result?.is_error || text.length >= body.length) return null;
  return `[prism-hook: ${label} compressed by ${MODEL} from ${body.length} to ${text.length} chars for this task. For exact text, Read the file with offset/limit or rerun a narrower command.]\n${text}`;
}

function hook(input: any): object | null {
  const tool = input.tool_name;
  const args = input.tool_input ?? {};
  if (tool === "Read") {
    if (args.offset !== undefined || args.limit !== undefined || !existsSync(args.file_path)) return null;
    if (!statSync(args.file_path).isFile() || statSync(args.file_path).size < MIN_CHARS) return null;
    const lines = readFileSync(args.file_path, "utf8").split("\n");
    const numbered = lines.map((line, i) => `${i + 1}\t${line}`).join("\n");
    const task = taskContext(input.transcript_path);
    const key = createHash("sha256").update(numbered).update(task).digest("hex").slice(0, 16);
    const out = join(CACHE, `${key}.md`);
    if (!existsSync(out)) {
      const text = compress(`Read ${args.file_path} (${lines.length} lines)`, numbered, task);
      if (!text) return null;
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(out, text);
    }
    return { file_path: out };
  }
  if (tool === "Bash") {
    const command: string = args.command ?? "";
    if (!isReadOnly(command)) return null;
    mkdirSync(CACHE, { recursive: true });
    const taskFile = join(CACHE, `task-${input.session_id ?? "x"}.txt`);
    writeFileSync(taskFile, taskContext(input.transcript_path));
    const encoded = Buffer.from(command).toString("base64");
    return { ...args, command: `node --disable-warning=ExperimentalWarning ${SELF} run ${encoded} ${taskFile}` };
  }
  return null;
}

function main(): void {
  if (process.env.PRISM_HOOK_NESTED) return;
  if (process.argv[2] === "run") {
    const command = Buffer.from(process.argv[3] ?? "", "base64").toString("utf8");
    const task = existsSync(process.argv[4] ?? "") ? readFileSync(process.argv[4]!, "utf8") : "";
    const run = spawnSync("bash", ["-c", command], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const body = (run.stdout ?? "") + (run.stderr ?? "");
    process.stdout.write(body.length < MIN_CHARS ? body : (compress(`Output of: ${command.slice(0, 300)}`, body, task) ?? body));
    process.exitCode = run.status ?? 1;
    return;
  }
  let input: any;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  let updatedInput: object | null = null;
  try { updatedInput = hook(input); } catch { updatedInput = null; }
  if (!updatedInput) return;
  // The rewritten Bash command no longer matches the user's allow rules, so the
  // hook vouches for it; isReadOnly already restricted it to read-only commands.
  const decision = input.tool_name === "Bash" ? { permissionDecision: "allow" } : {};
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision, updatedInput } }));
}

main();
