// Summarize evaluation runs: node summarize.ts [results-dir]
// Reads each run's stream.jsonl and prints one row per run as JSON lines.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Line = Record<string, any>;

const root = process.argv[2] ?? join(import.meta.dirname, "results");
// Pilot runs recorded the earlier group codes.
const GROUPS: Record<string, string> = {
  A: "control", C: "prism", CU: "prism-unlimited", H: "hook", XA: "codex-control", XC: "codex-prism",
};

for (const id of readdirSync(root).sort()) {
  const dir = join(root, id);
  const streamPath = join(dir, "stream.jsonl");
  if (!existsSync(streamPath)) continue;
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const exit = existsSync(join(dir, "exit.json")) ? JSON.parse(readFileSync(join(dir, "exit.json"), "utf8")) : {};
  const codexUsage = join(dir, "codex-usage.json");
  if (existsSync(codexUsage)) {
    // Codex runs: usage comes from the session rollouts; the answer is already in answer.md.
    const usage = JSON.parse(readFileSync(codexUsage, "utf8"));
    console.log(JSON.stringify({
      id, group: GROUPS[meta.arm] ?? meta.arm, task: meta.task, run: meta.run, exit: exit.exit, wall_seconds: exit.wall_seconds,
      cost_usd: usage.cost_usd, models: usage.models,
    }));
    continue;
  }
  const lines: Line[] = readFileSync(streamPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((text) => {
      try { return [JSON.parse(text)]; } catch { return []; }
    });

  // Background subagents make the session emit a result per turn; the last
  // one carries the final answer (costs are session totals on each).
  const result = lines.filter((line) => line.type === "result").at(-1) ?? {};
  writeFileSync(join(dir, "answer.md"), result.result ?? "");
  // Primary-agent messages have no parent tool use; subagent traffic does.
  const primaryToolUses = lines
    .filter((line) => line.type === "assistant" && !line.parent_tool_use_id)
    .flatMap((line) => (line.message?.content ?? []).filter((part: Line) => part.type === "tool_use"));
  const agentCalls = primaryToolUses.filter((use) => use.name === "Agent" || use.name === "Task");
  const lastAgentIndex = primaryToolUses.findLastIndex((use) => use.name === "Agent" || use.name === "Task");
  const reReads = lastAgentIndex < 0 ? null : primaryToolUses.slice(lastAgentIndex + 1).length;

  const models: Record<string, { cost: number; input: number; output: number }> = {};
  for (const [model, usage] of Object.entries<Line>(result.modelUsage ?? {})) {
    models[model] = {
      cost: usage.costUSD ?? 0,
      input: (usage.inputTokens ?? 0) + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0),
      output: usage.outputTokens ?? 0,
    };
  }
  const primaryInput = Object.entries(models)
    .filter(([model]) => model.startsWith(meta.primary))
    .reduce((sum, [, usage]) => sum + usage.input, 0);

  const hookLog = join(dir, "hook.jsonl");
  const hookCalls: Line[] = existsSync(hookLog)
    ? readFileSync(hookLog, "utf8").split("\n").filter(Boolean).map((text) => JSON.parse(text))
    : [];
  const hookCost = hookCalls.reduce((sum, call) => sum + (call.cost_usd ?? 0), 0);

  console.log(JSON.stringify({
    id,
    group: GROUPS[meta.arm] ?? meta.arm,
    task: meta.task,
    run: meta.run,
    exit: exit.exit,
    error: result.is_error ?? null,
    wall_seconds: exit.wall_seconds,
    cost_usd: result.total_cost_usd + hookCost,
    hook: hookCalls.length ? {
      calls: hookCalls.length,
      cost_usd: hookCost,
      ms: hookCalls.reduce((sum, call) => sum + (call.ms ?? 0), 0),
      before_chars: hookCalls.reduce((sum, call) => sum + (call.before_chars ?? 0), 0),
      after_chars: hookCalls.reduce((sum, call) => sum + (call.after_chars ?? 0), 0),
    } : null,
    primary_input_tokens: primaryInput,
    primary_tool_calls: primaryToolUses.length,
    agent_calls: agentCalls.length,
    primary_tool_calls_after_briefs: reReads,
    cargo_test: existsSync(join(dir, "cargo-test.status")) ? readFileSync(join(dir, "cargo-test.status"), "utf8").trim() : null,
    models,
  }));
}
