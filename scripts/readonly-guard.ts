#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
// PreToolUse hook for read-only prism workers in Claude Code. Allows Bash
// command chains in which every segment is a read-only command, and denies
// everything else, so a reader cannot write, fetch, or run programs.
// Codex workers get the same guarantee from `sandbox_mode = "read-only"`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const READ_ONLY = [
  /^cd(\s+\S+)?$/,
  /^echo(\s|$)/,
  /^(cat|grep|rg|head|tail|nl|wc|ls)(\s|$)/,
  /^sed -n '?\d+(,\d+)?p'?(\s|$)/,
  /^find\s(?!.*\s-(exec|execdir|delete|ok|fprint|fls)\b)/,
  /^git (grep|ls-files|log|show|diff|blame)(\s|$)/,
];

/** True when every segment of the chain is allow-listed and nothing is substituted or redirected. */
export function isReadOnly(command: string): boolean {
  const unquoted = command.replace(/'[^']*'|"[^"$`\\]*"/g, "''");
  if (/[`$<>(){}\n\\]/.test(unquoted)) return false;
  const split = /&&|\|\||[;|](?=(?:[^'"]|'[^']*'|"[^"]*")*$)/;
  const segments = command.split(split).map((segment) => segment.trim()).filter(Boolean);
  const unquotedSegments = unquoted.split(/&&|\|\||[;|]/).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 && segments.length === unquotedSegments.length
    && segments.every((segment) => READ_ONLY.some((pattern) => pattern.test(segment)));
}

function main(): void {
  let input: { tool_name?: string; tool_input?: { command?: string } };
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.tool_name !== "Bash" || isReadOnly(input.tool_input?.command ?? "")) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Read-only worker: use grep, rg, cat, sed -n, head, tail, ls, find, or read-only git, without redirection or substitution.",
    },
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
