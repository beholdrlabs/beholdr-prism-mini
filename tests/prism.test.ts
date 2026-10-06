import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { EXIT, main, runtime, type Migration } from "../scripts/prism.ts";

const FAST = [{ model: "fast-model", via: "omp", effort: "low" }];
const REASONING = [{ model: "deep-model", via: "claude-code", effort: "high" }];
const RESEARCH_DEFAULTS = { brief_max_words: 2000, total_brief_max_words: 5000, worker_max_tool_calls: 30 };

const tempRoots: string[] = [];
after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

function env() {
  const root = mkdtempSync(join(tmpdir(), "prism-"));
  tempRoots.push(root);
  const home = join(root, "home");
  const repo = join(home, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  return { home, repo };
}

function write(path: string, data: unknown): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return path;
}

const userCfg = (home: string) => join(home, ".beholdr", "prism-mini.config.json");
const projectCfg = (repo: string) => join(repo, ".beholdr", "prism-mini.config.json");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

function run(argv: string[], home: string, cwd: string) {
  let out = "";
  let err = "";
  const code = main(argv, { cwd, home, out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

function full(extra: Record<string, unknown> = {}) {
  return { version: 1, roles: { fast: FAST, reasoning: REASONING }, ...extra };
}

/** Pretend the skill expects config v2 and ships a 1 -> 2 migration. */
function withV2(fn: () => void) {
  const saved = { ...runtime };
  const schema = runtime.loadSchema(1);
  schema.properties!.version = { const: 2 };
  runtime.supportedVersion = 2;
  runtime.migrations = { 1: ((d) => ({ ...d, version: 2 })) as Migration };
  runtime.loadSchema = () => schema;
  try {
    fn();
  } finally {
    Object.assign(runtime, saved);
  }
}

// check

test("no config exits 2", () => {
  const { home, repo } = env();
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.NO_CONFIG);
  assert.match(err, /init/);
});

test("user config only", () => {
  const { home, repo } = env();
  write(userCfg(home), full());
  const { code, out } = run(["check"], home, repo);
  assert.equal(code, 0);
  const data = JSON.parse(out);
  assert.deepEqual(data.roles.fast, FAST);
  assert.deepEqual(data.compression, {
    enabled: true,
    brief_max_words: 800,
    total_brief_max_words: 2000,
    worker_max_tool_calls: 15,
    research: RESEARCH_DEFAULTS,
  });
  assert.deepEqual(data.sources, { user: userCfg(home) });
});

test("project config found from subdirectory", () => {
  const { home, repo } = env();
  write(projectCfg(repo), full());
  const deep = join(repo, "src", "deep");
  mkdirSync(deep, { recursive: true });
  const { code, out } = run(["check"], home, deep);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out).sources, { project: projectCfg(repo) });
});

test("git worktree (.git file) counts as the project root", () => {
  const { home } = env();
  const worktree = join(home, "wt");
  write(join(worktree, ".git"), "gitdir: /elsewhere\n");
  write(projectCfg(worktree), full());
  mkdirSync(join(worktree, "sub"));
  assert.equal(run(["check"], home, join(worktree, "sub")).code, 0);
});

test("project role replaces user role and inherits others", () => {
  const { home, repo } = env();
  write(userCfg(home), full({ compression: { brief_max_words: 500 } }));
  const projectFast = [{ model: "project-fast", via: "codex" }];
  write(projectCfg(repo), { version: 1, roles: { fast: projectFast }, compression: { enabled: false } });
  const { code, out } = run(["check"], home, repo);
  assert.equal(code, 0);
  const data = JSON.parse(out);
  assert.deepEqual(data.roles, { fast: projectFast, reasoning: REASONING });
  assert.deepEqual(data.compression, {
    enabled: false,
    brief_max_words: 500,
    total_brief_max_words: 2000,
    worker_max_tool_calls: 15,
    research: RESEARCH_DEFAULTS,
  });
});

test("project with only compression inherits roles", () => {
  const { home, repo } = env();
  write(userCfg(home), full());
  write(projectCfg(repo), { version: 1, compression: { brief_max_words: 300 } });
  const { code, out } = run(["check"], home, repo);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out).roles, { fast: FAST, reasoning: REASONING });
});

test("home cwd does not double count user config", () => {
  const { home } = env();
  write(userCfg(home), full());
  const { code, out } = run(["check"], home, home);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out).sources, { user: userCfg(home) });
});

test("non-git directory only checks cwd", () => {
  const { home } = env();
  const outside = join(home, "notes", "sub");
  mkdirSync(outside, { recursive: true });
  write(join(home, "notes", ".beholdr", "prism-mini.config.json"), full());
  assert.equal(run(["check"], home, outside).code, EXIT.NO_CONFIG);
});

for (const text of ["", '{"version": 1,', "[1, 2]", "null"]) {
  test(`malformed JSON ${JSON.stringify(text)} exits 3 with path`, () => {
    const { home, repo } = env();
    const path = write(projectCfg(repo), text);
    const { code, err } = run(["check"], home, repo);
    assert.equal(code, EXIT.INVALID);
    assert.ok(err.includes(path));
  });
}

test("duplicate keys exit 3", () => {
  const { home, repo } = env();
  write(projectCfg(repo), '{"version": 1, "roles": {"fast": [], "fast": []}}');
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.INVALID);
  assert.match(err, /duplicate key "fast"/);
});

test("duplicate-looking keys in separate objects are fine", () => {
  const { home, repo } = env();
  write(projectCfg(repo), {
    version: 1,
    roles: { fast: [{ model: "a", via: "omp" }, { model: "b", via: "omp" }], reasoning: REASONING },
  });
  assert.equal(run(["check"], home, repo).code, 0);
});

for (const version of ["1", true, null, 0, 1.5]) {
  test(`bad version ${JSON.stringify(version)} exits 3`, () => {
    const { home, repo } = env();
    const doc: Record<string, unknown> = full();
    if (version === null) delete doc.version;
    else doc.version = version;
    write(projectCfg(repo), doc);
    const { code, err } = run(["check"], home, repo);
    assert.equal(code, EXIT.INVALID);
    assert.match(err, /version/);
  });
}

test("schema error names JSON path", () => {
  const { home, repo } = env();
  write(projectCfg(repo), full({ roles: { fast: [{ model: "m", via: "openrouter" }], reasoning: REASONING } }));
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.INVALID);
  assert.ok(err.includes("$.roles.fast[0].via"));
});

test("missing role after merge exits 3", () => {
  const { home, repo } = env();
  write(projectCfg(repo), { version: 1, roles: { fast: FAST } });
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.INVALID);
  assert.match(err, /reasoning/);
});

test("newer config exits 5", () => {
  const { home, repo } = env();
  write(projectCfg(repo), full({ version: 2 }));
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.TOO_NEW);
  assert.match(err, /update/);
});

test("older config exits 4", () => {
  withV2(() => {
    const { home, repo } = env();
    write(projectCfg(repo), full());
    const { code, err } = run(["check"], home, repo);
    assert.equal(code, EXIT.MIGRATE);
    assert.ok(err.includes("migrate --project --write"));
  });
});

test("non-UTF-8 config exits 3", () => {
  const { home, repo } = env();
  const path = projectCfg(repo);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from([0x7b, 0xff, 0x7d]));
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.INVALID);
  assert.ok(err.includes(path));
});

test("unreadable config exits 3", { skip: process.getuid?.() === 0 }, () => {
  const { home, repo } = env();
  const path = write(projectCfg(repo), full());
  chmodSync(path, 0);
  try {
    const { code, err } = run(["check"], home, repo);
    assert.equal(code, EXIT.INVALID);
    assert.ok(err.includes(path));
  } finally {
    chmodSync(path, 0o644);
  }
});

test("empty role error explains inheritance", () => {
  const { home, repo } = env();
  write(userCfg(home), full());
  write(projectCfg(repo), { version: 1, roles: { fast: [], reasoning: REASONING } });
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.INVALID);
  assert.match(err, /remove the key to inherit/);
});

test("usage errors exit 1", () => {
  const { home, repo } = env();
  for (const argv of [[], ["bogus"], ["check", "--nope"], ["init", "--user", "--project"]]) {
    const { code, err } = run(argv, home, repo);
    assert.equal(code, EXIT.USAGE, argv.join(" "));
    assert.match(err, /usage/);
  }
});

// init

test("init project writes at git root with schema URI", () => {
  const { home, repo } = env();
  const sub = join(repo, "pkg");
  mkdirSync(sub);
  const { code, out } = run(["init"], home, sub);
  assert.equal(code, 0);
  assert.equal(out.trim(), projectCfg(repo));
  const uri = read(projectCfg(repo)).$schema as string;
  assert.ok(uri.startsWith("file:///"));
  assert.ok(existsSync(fileURLToPath(uri)));
});

test("fresh scaffold fails check until filled", () => {
  const { home, repo } = env();
  run(["init"], home, repo);
  const { code, err } = run(["check"], home, repo);
  assert.equal(code, EXIT.INVALID);
  assert.ok(err.includes("$.roles.fast"));
});

test("init refuses overwrite without --force", () => {
  const { home, repo } = env();
  const target = write(projectCfg(repo), full());
  const { code, err } = run(["init"], home, repo);
  assert.equal(code, EXIT.USAGE);
  assert.match(err, /--force/);
  assert.deepEqual(read(target), full());
  assert.equal(run(["init", "--force"], home, repo).code, 0);
  assert.deepEqual(read(target).roles.fast, []);
});

test("init --user", () => {
  const { home, repo } = env();
  const { code, out } = run(["init", "--user"], home, repo);
  assert.equal(code, 0);
  assert.equal(out.trim(), userCfg(home));
});

test("init --project outside a project refuses to touch the user file", () => {
  const { home } = env();
  const user = write(userCfg(home), full());
  const { code, err } = run(["init", "--project", "--force"], home, home);
  assert.equal(code, EXIT.USAGE);
  assert.match(err, /--user/);
  assert.deepEqual(read(user), full());
});

// migrate

test("migrate current is a no-op", () => {
  const { home, repo } = env();
  write(projectCfg(repo), full());
  const { code, out } = run(["migrate"], home, repo);
  assert.equal(code, 0);
  assert.match(out, /already at version 1/);
});

test("migrate missing config exits 2", () => {
  const { home, repo } = env();
  assert.equal(run(["migrate", "--user"], home, repo).code, EXIT.NO_CONFIG);
});

test("migrate dry run then write", () => {
  withV2(() => {
    const { home, repo } = env();
    const target = write(projectCfg(repo), full());
    const original = readFileSync(target, "utf8");

    let { code, out } = run(["migrate"], home, repo);
    assert.equal(code, 0);
    const migrated = JSON.parse(out);
    assert.equal(Object.keys(migrated)[0], "$schema");
    assert.equal(migrated.version, 2);
    assert.equal(readFileSync(target, "utf8"), original);

    ({ code, out } = run(["migrate", "--write"], home, repo));
    assert.equal(code, 0);
    assert.equal(readFileSync(`${target}.v1.bak`, "utf8"), original);
    assert.equal(run(["check"], home, repo).code, 0);
  });
});

test("agents renders Claude and Codex workers from the config", () => {
  const { home, repo } = env();
  write(projectCfg(repo), {
    version: 1,
    roles: {
      fast: [{ model: "claude-haiku-4-5", via: "claude-code" }, { model: "gpt-6-luna", via: "codex", effort: "low" }],
      reasoning: REASONING,
    },
  });
  const { code, out } = run(["agents"], home, repo);
  assert.equal(code, 0);
  for (const mode of ["reader", "researcher", "editor"]) {
    assert.match(out, new RegExp(`\\.claude/agents/prism-${mode}\\.md`));
    assert.match(out, new RegExp(`\\.codex/agents/prism_${mode}\\.toml`));
  }
  assert.match(out, /model: claude-haiku-4-5/);
  assert.match(out, /model = "gpt-6-luna"/);
  assert.match(out, /sandbox_mode = "read-only"/);
  assert.match(out, /sandbox_mode = "workspace-write"/);
  assert.match(out, /isolation: worktree/);
  assert.match(out, /readonly-guard\.ts/);
  assert.match(out, /at most 30 tool calls/);
  assert.ok(!existsSync(join(repo, ".claude")), "dry run must not write files");
});

test("agents --write creates the files", () => {
  const { home, repo } = env();
  write(projectCfg(repo), full());
  assert.equal(run(["agents", "--write"], home, repo).code, 0);
  assert.ok(existsSync(join(repo, ".claude", "agents", "prism-reader.md")));
  assert.ok(existsSync(join(repo, ".codex", "agents", "prism_reader.toml")));
});
