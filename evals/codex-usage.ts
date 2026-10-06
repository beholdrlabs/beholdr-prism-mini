// Sum Codex token usage for one `codex exec` run, including spawned subagents,
// and price it at API list rates: node codex-usage.ts <root-thread-id> [sessions-dir]
// Every thread of a run shares the root's session_id in its rollout file.
// Assumes output_tokens includes reasoning tokens, as in the OpenAI API.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// USD per 1M tokens (developers.openai.com, checked 2026-10-06).
const PRICES: Record<string, { input: number; cached: number; write: number; output: number; longContext?: number }> = {
  "gpt-6.1-sol": { input: 2, cached: 0.1, write: 2.5, output: 10, longContext: 272_000 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, write: 0.125, output: 0.5 },
};

const root = process.argv[2];
if (!root) throw new Error("usage: codex-usage.ts <root-thread-id> [sessions-dir]");
const sessions = process.argv[3] ?? join(homedir(), ".codex", "sessions");

function* rollouts(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* rollouts(path);
    else if (name.endsWith(".jsonl") && name.includes("rollout-")) yield path;
  }
}

type Usage = { input_tokens: number; cached_input_tokens: number; cache_write_input_tokens: number; output_tokens: number };
const totals: Record<string, { requests: number; input: number; cached: number; write: number; output: number; cost_usd: number; threads: number }> = {};

for (const path of rollouts(sessions)) {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const meta = JSON.parse(lines[0]!);
  if (meta.type !== "session_meta" || meta.payload?.session_id !== root) continue;
  let model = "unknown";
  let counted = false;
  for (const line of lines) {
    const entry = JSON.parse(line);
    const payload = entry.payload ?? {};
    if (payload.type === "thread_settings_applied") model = payload.thread_settings?.model ?? model;
    if (entry.type === "turn_context" && model === "unknown") model = payload.model ?? model;
    if (entry.type !== "token_usage_record") continue;
    const usage: Usage = payload.usage;
    const price = PRICES[model];
    const bucket = (totals[model] ??= { requests: 0, input: 0, cached: 0, write: 0, output: 0, cost_usd: 0, threads: 0 });
    if (!counted) { bucket.threads += 1; counted = true; }
    const fresh = usage.input_tokens - usage.cached_input_tokens - usage.cache_write_input_tokens;
    const long = price?.longContext !== undefined && usage.input_tokens > price.longContext;
    bucket.requests += 1;
    bucket.input += usage.input_tokens;
    bucket.cached += usage.cached_input_tokens;
    bucket.write += usage.cache_write_input_tokens;
    bucket.output += usage.output_tokens;
    if (price) {
      const inputRate = long ? 2 : 1;
      bucket.cost_usd += (fresh * price.input * inputRate + usage.cached_input_tokens * price.cached * inputRate
        + usage.cache_write_input_tokens * price.write * inputRate + usage.output_tokens * price.output * (long ? 1.5 : 1)) / 1e6;
    }
  }
}

const cost = Object.values(totals).reduce((sum, bucket) => sum + bucket.cost_usd, 0);
console.log(JSON.stringify({ root, cost_usd: cost, models: totals }, null, 2));
