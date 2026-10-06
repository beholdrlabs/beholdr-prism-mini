#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
// Scaffold, validate, and migrate beholdr-prism-mini routing configs.
// Runs with Node.js 22.18+ (built-in type stripping) or Bun. No dependencies.

import { copyFileSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderAgents } from "./agents.ts";
import { validate, type JsonPath, type Schema, type SchemaError } from "./validate.ts";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(SKILL_DIR, "assets");
const ROLES = ["fast", "reasoning"] as const;
const CONFIG_RELPATH = join(".beholdr", "prism-mini.config.json");
const DEFAULT_COMPRESSION = {
  enabled: true,
  brief_max_words: 800,
  total_brief_max_words: 2000,
  worker_max_tool_calls: 15,
  research: { brief_max_words: 2000, total_brief_max_words: 5000, worker_max_tool_calls: 30 },
};
const USAGE = `usage: prism.ts check
       prism.ts init [--project | --user] [--force]
       prism.ts migrate [--project | --user] [--write]
       prism.ts agents [--project | --user] [--write]`;

export const EXIT = { OK: 0, USAGE: 1, NO_CONFIG: 2, INVALID: 3, MIGRATE: 4, TOO_NEW: 5 } as const;

type Config = Record<string, unknown>;
/** Turns a version N config into a version N+1 config. */
export type Migration = (config: Config) => Config;
type Scope = "project" | "user";

export function schemaPath(version: number): string {
  return join(ASSETS, `config.schema.v${version}.json`);
}

/** Mutable so tests can simulate a newer config version. */
export const runtime = {
  supportedVersion: 1,
  migrations: {} as Record<number, Migration>,
  loadSchema: (version: number): Schema => JSON.parse(readFileSync(schemaPath(version), "utf8")) as Schema,
};

export class ConfigError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function realOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function* ancestors(start: string): Generator<string> {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    yield dir;
    if (dirname(dir) === dir) return;
  }
}

function gitRoot(start: string): string | null {
  for (const dir of ancestors(start)) {
    try {
      statSync(join(dir, ".git")); // a directory, or a file in worktrees and submodules
      return dir;
    } catch {
      continue;
    }
  }
  return null;
}

const userConfigPath = (home: string) => join(home, CONFIG_RELPATH);
const projectTarget = (cwd: string) => join(gitRoot(cwd) ?? resolve(cwd), CONFIG_RELPATH);

/** Search cwd up to the git root (or only cwd outside git), skipping the user file. */
function projectConfigPath(cwd: string, home: string): string | null {
  const stop = gitRoot(cwd) ?? resolve(cwd);
  const user = realOrSelf(userConfigPath(home));
  for (const dir of ancestors(cwd)) {
    const candidate = join(dir, CONFIG_RELPATH);
    if (isFile(candidate) && realOrSelf(candidate) !== user) return candidate;
    if (dir === stop) break;
  }
  return null;
}

/** JSON.parse keeps the last duplicate key; find duplicates in already-valid JSON text. */
function duplicateKey(text: string): string | null {
  const stack: (Set<string> | null)[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") stack.push(new Set());
    else if (ch === "[") stack.push(null);
    else if (ch === "}" || ch === "]") stack.pop();
    else if (ch === '"') {
      let end = i + 1;
      while (text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      const keys = stack.at(-1);
      const next = text.slice(end + 1).trimStart()[0];
      if (keys && next === ":") {
        const key = JSON.parse(text.slice(i, end + 1)) as string;
        if (keys.has(key)) return key;
        keys.add(key);
      }
      i = end;
    }
  }
  return null;
}

function loadFile(path: string): Config {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  } catch (error) {
    throw new ConfigError(EXIT.INVALID, `${path}: cannot read: ${(error as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(EXIT.INVALID, `${path}: not valid JSON: ${(error as Error).message}`);
  }
  const duplicate = duplicateKey(text);
  if (duplicate !== null) throw new ConfigError(EXIT.INVALID, `${path}: not valid JSON: duplicate key "${duplicate}"`);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError(EXIT.INVALID, `${path}: expected a JSON object with a "version" key`);
  }
  return data as Config;
}

function fileVersion(data: Config, path: string): number {
  const version = data.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ConfigError(EXIT.INVALID, `${path}: "version" must be a positive integer, got ${JSON.stringify(version)}`);
  }
  if (version > runtime.supportedVersion) {
    throw new ConfigError(
      EXIT.TOO_NEW,
      `${path}: config version ${version} is newer than this skill supports (${runtime.supportedVersion}); update beholdr-prism-mini`,
    );
  }
  return version;
}

function upgrade(data: Config, path: string): Config {
  let version = fileVersion(data, path);
  while (version < runtime.supportedVersion) {
    const step = runtime.migrations[version];
    if (!step) throw new ConfigError(EXIT.INVALID, `${path}: no migration from config version ${version}`);
    data = step(structuredClone(data));
    version = data.version as number;
  }
  return data;
}

const jsonPath = (path: JsonPath) => "$" + path.map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`)).join("");

function hint(error: SchemaError): string {
  return error.keyword === "minItems" && error.path[0] === "roles"
    ? " (add a candidate, or remove the key to inherit this role from the user config)"
    : "";
}

function check(data: Config, path: string): void {
  const errors = validate(runtime.loadSchema(runtime.supportedVersion), data);
  if (errors.length === 0) return;
  const lines = errors.map((e) => `  ${jsonPath(e.path)}: ${e.message}${hint(e)}`).join("\n");
  throw new ConfigError(EXIT.INVALID, `${path}: does not match config schema v${runtime.supportedVersion}:\n${lines}`);
}

/** Later layers win: a role list replaces the earlier one; compression merges by key. */
function merge(layers: Config[]): Config {
  const roles: Record<string, unknown> = {};
  const compression: Record<string, unknown> = { ...DEFAULT_COMPRESSION };
  for (const layer of layers) {
    Object.assign(roles, layer.roles ?? {});
    const { research, ...rest } = (layer.compression ?? {}) as Config;
    Object.assign(compression, rest);
    compression.research = { ...(compression.research as Config), ...((research as Config) ?? {}) };
  }
  const missing = ROLES.filter((role) => !(role in roles));
  if (missing.length > 0) {
    throw new ConfigError(
      EXIT.INVALID,
      `no candidates for role(s): ${missing.join(", ")}; add them under "roles" in the project or user config`,
    );
  }
  return { version: runtime.supportedVersion, roles, compression };
}

function resolveConfig(cwd: string, home: string): Config {
  const found: Partial<Record<Scope, string>> = {};
  const user = userConfigPath(home);
  if (isFile(user)) found.user = user;
  const project = projectConfigPath(cwd, home);
  if (project !== null) found.project = project;
  if (!found.user && !found.project) {
    throw new ConfigError(
      EXIT.NO_CONFIG,
      `no config found (looked for ${projectTarget(cwd)} and ${user}); run: prism.ts init`,
    );
  }
  const layers: Config[] = [];
  for (const [scope, path] of Object.entries(found) as [Scope, string][]) {
    const data = loadFile(path);
    const version = fileVersion(data, path);
    if (version < runtime.supportedVersion) {
      check(upgrade(data, path), path);
      throw new ConfigError(
        EXIT.MIGRATE,
        `${path}: config version ${version} needs migration to ${runtime.supportedVersion}; ` +
          `run: prism.ts migrate --${scope} --write`,
      );
    }
    check(data, path);
    layers.push(data);
  }
  return { ...merge(layers), sources: found };
}

/** Serialise a config file with $schema pointing at the installed schema. */
function dump(data: Config): string {
  const { $schema: _, ...rest } = data;
  const body = { $schema: pathToFileURL(schemaPath(runtime.supportedVersion)).href, ...rest };
  return `${JSON.stringify(body, null, 2)}\n`;
}

interface Io {
  cwd: string;
  home: string;
  out: (text: string) => void;
  err: (text: string) => void;
}

function cmdInit(io: Io, scope: Scope, force: boolean): number {
  const target = scope === "user" ? userConfigPath(io.home) : projectTarget(io.cwd);
  if (scope === "project" && target === userConfigPath(io.home)) {
    throw new ConfigError(EXIT.USAGE, `${io.cwd} is not inside a project; run from a project directory, or use --user`);
  }
  if (isFile(target) && !force) {
    throw new ConfigError(EXIT.USAGE, `${target} already exists; edit it, or pass --force to replace it`);
  }
  const template = readFileSync(join(ASSETS, "config.template.json"), "utf8");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, template.replace("{{SCHEMA_URI}}", pathToFileURL(schemaPath(runtime.supportedVersion)).href));
  io.out(`${target}\n`);
  return EXIT.OK;
}

function cmdMigrate(io: Io, scope: Scope, write: boolean): number {
  const path = scope === "user" ? userConfigPath(io.home) : projectConfigPath(io.cwd, io.home);
  if (path === null || !isFile(path)) throw new ConfigError(EXIT.NO_CONFIG, `no ${scope} config found; nothing to migrate`);
  const data = loadFile(path);
  const old = fileVersion(data, path);
  if (old === runtime.supportedVersion) {
    io.out(`${path}: already at version ${old}\n`);
    return EXIT.OK;
  }
  const migrated = upgrade(data, path);
  check(migrated, path);
  const text = dump(migrated);
  if (!write) {
    io.out(text);
    return EXIT.OK;
  }
  const backup = `${path}.v${old}.bak`;
  copyFileSync(path, backup);
  writeFileSync(path, text);
  io.out(`migrated ${path} to version ${runtime.supportedVersion}; previous file saved as ${backup}\n`);
  return EXIT.OK;
}

/** Generate harness worker files from the resolved config; print them unless --write. */
function cmdAgents(io: Io, scope: Scope, write: boolean): number {
  const config = resolveConfig(io.cwd, io.home);
  const root = scope === "user" ? io.home : gitRoot(io.cwd);
  if (root === null) throw new ConfigError(EXIT.USAGE, `${io.cwd} is not inside a project; run from a project directory, or use --user`);
  for (const file of renderAgents(config, SKILL_DIR)) {
    const target = join(root, file.path);
    if (write) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
      io.out(`${target}\n`);
    } else {
      io.out(`# ${target}\n${file.content}\n`);
    }
  }
  return EXIT.OK;
}

function parseArgs(argv: string[]): { command: string; scope: Scope; flags: Set<string> } {
  const [command, ...rest] = argv;
  const allowed: Record<string, string[]> = {
    check: [],
    init: ["--project", "--user", "--force"],
    migrate: ["--project", "--user", "--write"],
    agents: ["--project", "--user", "--write"],
  };
  if (command === undefined || !(command in allowed)) {
    throw new ConfigError(EXIT.USAGE, command === undefined ? "missing command" : `unknown command "${command}"`);
  }
  const flags = new Set(rest);
  for (const flag of flags) {
    if (!allowed[command]!.includes(flag)) throw new ConfigError(EXIT.USAGE, `unknown option "${flag}" for ${command}`);
  }
  if (flags.has("--project") && flags.has("--user")) throw new ConfigError(EXIT.USAGE, "--project and --user conflict");
  return { command, scope: flags.has("--user") ? "user" : "project", flags };
}

export function main(argv: string[], io: Io): number {
  try {
    const { command, scope, flags } = parseArgs(argv);
    if (command === "init") return cmdInit(io, scope, flags.has("--force"));
    if (command === "migrate") return cmdMigrate(io, scope, flags.has("--write"));
    if (command === "agents") return cmdAgents(io, scope, flags.has("--write"));
    io.out(`${JSON.stringify(resolveConfig(io.cwd, io.home), null, 2)}\n`);
    return EXIT.OK;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    io.err(`error: ${error.message}\n`);
    if (error.code === EXIT.USAGE && !/already exists|not inside a project/.test(error.message)) io.err(`${USAGE}\n`);
    return error.code;
  }
}

const invokedDirectly = process.argv[1] !== undefined && realOrSelf(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2), {
    cwd: process.cwd(),
    home: homedir(),
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
}
