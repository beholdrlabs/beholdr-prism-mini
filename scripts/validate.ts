// Minimal JSON Schema (draft 2020-12) validator for the keywords the config
// schema uses. tests/schema.test.ts fails if the schema adopts a keyword that
// is not listed in SUPPORTED_KEYWORDS, so the two cannot drift silently.

export interface Schema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, Schema>;
  title?: string;
  description?: string;
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  minItems?: number;
  items?: Schema;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
}

export type JsonPath = (string | number)[];

export interface SchemaError {
  path: JsonPath;
  keyword: string;
  message: string;
}

export const SUPPORTED_KEYWORDS = new Set([
  "$schema", "$id", "$ref", "$defs", "title", "description",
  "type", "const", "enum", "pattern", "minLength", "minimum", "minItems",
  "items", "required", "properties", "additionalProperties",
]);

const show = (value: unknown) => JSON.stringify(value);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasType(value: unknown, type: NonNullable<Schema["type"]>): boolean {
  switch (type) {
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return Number.isInteger(value);
    default:
      return typeof value === type;
  }
}

function equal(a: unknown, b: unknown): boolean {
  return show(a) === show(b);
}

function walk(root: Schema, schema: Schema, value: unknown, path: JsonPath, errors: SchemaError[]): void {
  const fail = (keyword: string, message: string, at: JsonPath = path) => errors.push({ path: at, keyword, message });

  if (schema.$ref !== undefined) {
    const target = root.$defs?.[schema.$ref.replace("#/$defs/", "")];
    if (!target) throw new Error(`unresolvable $ref ${schema.$ref}`);
    walk(root, target, value, path, errors);
  }
  if (schema.type !== undefined && !hasType(value, schema.type)) {
    fail("type", `${show(value)} is not of type "${schema.type}"`);
    return;
  }
  if ("const" in schema && !equal(value, schema.const)) fail("const", `${show(schema.const)} was expected`);
  if (schema.enum && !schema.enum.some((option) => equal(option, value))) {
    fail("enum", `${show(value)} is not one of ${schema.enum.map(show).join(", ")}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail("minLength", `${show(value)} is too short`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      fail("pattern", `${show(value)} does not match "${schema.pattern}"`);
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    fail("minimum", `${value} is less than the minimum of ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail("minItems", schema.minItems === 1 ? "[] should be non-empty" : `should have at least ${schema.minItems} items`);
    }
    if (schema.items) value.forEach((item, i) => walk(root, schema.items!, item, [...path, i], errors));
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) fail("required", `"${key}" is a required property`);
    }
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key];
      if (child) walk(root, child, item, [...path, key], errors);
      else if (schema.additionalProperties === false) {
        fail("additionalProperties", `unexpected property "${key}"`, [...path, key]);
      }
    }
  }
}

export function validate(schema: Schema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  walk(schema, schema, value, [], errors);
  return errors;
}
