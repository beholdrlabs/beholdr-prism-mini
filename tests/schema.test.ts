import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SUPPORTED_KEYWORDS, validate, type Schema } from "../scripts/validate.ts";

const ASSETS = join(import.meta.dirname, "..", "assets");
const SCHEMA = JSON.parse(readFileSync(join(ASSETS, "config.schema.v1.json"), "utf8")) as Schema;
const TEMPLATE = readFileSync(join(ASSETS, "config.template.json"), "utf8");

const FAST = [{ model: "fast-model", via: "omp", effort: "low" }];
const REASONING = [{ model: "deep-model", via: "claude-code", effort: "high", notes: "primary" }];

const errors = (doc: unknown) => validate(SCHEMA, doc);

test("schema uses only keywords the validator implements", () => {
  const unsupported = new Set<string>();
  const visit = (node: Schema) => {
    for (const [key, value] of Object.entries(node)) {
      if (!SUPPORTED_KEYWORDS.has(key)) unsupported.add(key);
      if (key === "properties" || key === "$defs") Object.values(value as Record<string, Schema>).forEach(visit);
      if (key === "items") visit(value as Schema);
    }
  };
  visit(SCHEMA);
  assert.deepEqual([...unsupported], []);
});

test("accepts full config", () => {
  const doc = {
    version: 1,
    roles: { fast: FAST, reasoning: REASONING },
    compression: { enabled: true, brief_max_words: 800, total_brief_max_words: 2000, worker_max_tool_calls: 15 },
  };
  assert.deepEqual(errors(doc), []);
});

test("accepts partial file and herdr via", () => {
  assert.deepEqual(errors({ version: 1, roles: { fast: [{ model: "m", via: "herdr:omp" }] } }), []);
});

test("accepts $schema key", () => {
  assert.deepEqual(errors({ $schema: "file:///skill/assets/config.schema.v1.json", version: 1 }), []);
});

const invalid: unknown[] = [
  { roles: { fast: FAST } },
  { version: 2 },
  { version: "1" },
  { version: 1.5 },
  { version: 1, api_key: "x" },
  { version: 1, roles: { worker: FAST } },
  { version: 1, roles: { fast: [] } },
  { version: 1, roles: { fast: [{ via: "omp" }] } },
  { version: 1, roles: { fast: [{ model: "", via: "omp" }] } },
  { version: 1, roles: { fast: [{ model: "m", via: "openrouter" }] } },
  { version: 1, roles: { fast: [{ model: "m", via: "herdr:" }] } },
  { version: 1, roles: { fast: [{ model: "m", via: "omp", effort: "ultra" }] } },
  { version: 1, roles: { fast: [{ model: "m", via: "omp", key: "sk-x" }] } },
  { version: 1, compression: { brief_max_words: 50 } },
  { version: 1, compression: { brief_max_words: 500.5 } },
  { version: 1, compression: { enabled: "yes" } },
  { version: 1, compression: { total_brief_max_words: 50 } },
  { version: 1, compression: { worker_max_tool_calls: 0 } },
  [1, 2],
];
for (const [i, doc] of invalid.entries()) {
  test(`rejects invalid #${i}: ${JSON.stringify(doc)}`, () => {
    assert.ok(errors(doc).length > 0);
  });
}

test("error paths point at the offending value", () => {
  const [error] = errors({ version: 1, roles: { fast: [{ model: "m", via: "openrouter" }] } });
  assert.deepEqual(error?.path, ["roles", "fast", 0, "via"]);
});

test("template has schema placeholder and empty roles", () => {
  const data = JSON.parse(TEMPLATE) as Record<string, unknown>;
  assert.equal(Object.keys(data)[0], "$schema");
  assert.equal(data.$schema, "{{SCHEMA_URI}}");
  delete data.$schema;
  assert.deepEqual(data, {
    version: 1,
    roles: { fast: [], reasoning: [] },
    compression: { enabled: true, brief_max_words: 800, total_brief_max_words: 2000, worker_max_tool_calls: 15 },
  });
});
