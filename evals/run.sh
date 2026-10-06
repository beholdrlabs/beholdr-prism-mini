#!/usr/bin/env bash
# Run one evaluation cell: ./run.sh <group> <task-id> <run-number>
# Groups (Claude Code, Opus primary): control, prism, prism-unlimited, hook.
# Groups (Codex, Sol primary): codex-control, codex-prism.
# Pilot result folders use the earlier codes A, C, CU, H, XA, XC, still accepted.
# Each run gets a fresh worktree of the subject repo at the pinned commit.
# Defaults to beholdr-lore; override with REPO, PIN, and TASKS.
set -euo pipefail

ARM=${1:?group: control, prism, prism-unlimited, hook, codex-control, or codex-prism}
case "$ARM" in
  A) ARM=control ;; C) ARM=prism ;; CU) ARM=prism-unlimited ;; H) ARM=hook ;;
  XA) ARM=codex-control ;; XC) ARM=codex-prism ;;
esac
TASK=${2:?task id from the tasks file}
RUN=${3:?run number}

EVAL_DIR=$(cd "$(dirname "$0")" && pwd)
LORE_REPO=${REPO:-$HOME/dev/beholdr-lore}
PIN=${PIN:-92a32dc}
TASKS=${TASKS:-$EVAL_DIR/tasks.md}
PRIMARY=claude-opus-5-5
EFFORT=medium
WORK_ROOT=${WORK_ROOT:-/tmp/prism-eval}
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$WORK_ROOT/target}

case "$ARM" in
  control) ROUTING="Work directly; do not start subagents."; EXTRA=(--disallowedTools Agent) ;;
  hook) ROUTING="Work directly; do not start subagents."
     HOOK="node --disable-warning=ExperimentalWarning $EVAL_DIR/experiments/compress-hook.ts"
     EXTRA=(--disallowedTools Agent --settings "{\"hooks\":{\"PreToolUse\":[{\"matcher\":\"Read|Bash\",\"hooks\":[{\"type\":\"command\",\"command\":\"$HOOK\",\"timeout\":240}]}]}}") ;;
  prism|prism-unlimited) if [ "$TASK" = Q1 ]; then
       ROUTING="Use the beholdr-prism-mini skill to route this work."
     else
       ROUTING="Use the beholdr-prism-mini skill to delegate the gathering to fast workers."
     fi
     EXTRA=() ;;
  codex-control) ROUTING="Work directly; do not spawn subagents."; PRIMARY=gpt-6.1-sol ;;
  codex-prism) ROUTING="Use the beholdr-prism-mini skill to delegate the gathering to fast workers."; PRIMARY=gpt-6.1-sol ;;
  *) echo "group must be control, prism, prism-unlimited, hook, codex-control, or codex-prism" >&2; exit 1 ;;
esac

# The prompt is the blockquote under "## <TASK>." in tasks.md.
TASK_PROMPT=$(awk -v id="## $TASK." '
  index($0, id) == 1 { on = 1; next }
  on && /^## / { exit }
  on && /^> ?/ { sub(/^> ?/, ""); print }
' "$TASKS")
[ -n "$TASK_PROMPT" ] || { echo "no prompt for $TASK in $TASKS" >&2; exit 1; }
PROMPT="$TASK_PROMPT

All answers must cite path:line for each claim.

$ROUTING"

ID="$(date -u +%Y%m%dT%H%M%SZ)-$TASK-$ARM-$RUN"
OUT="$EVAL_DIR/results/$ID"
WT="$WORK_ROOT/wt/$ID"
mkdir -p "$OUT" "$WORK_ROOT/wt"

git -C "$LORE_REPO" worktree add --quiet --detach "$WT" "$PIN"
if [ "$ARM" = codex-prism ]; then
  mkdir -p "$WT/.beholdr"
  cp "$EVAL_DIR/prism-mini.codex.config.json" "$WT/.beholdr/prism-mini.config.json"
  (cd "$WT" && node --disable-warning=ExperimentalWarning "$EVAL_DIR/../scripts/prism.ts" agents --write > /dev/null)
fi
if [ "$ARM" = prism ] || [ "$ARM" = prism-unlimited ]; then
  CONFIG=prism-mini.config.json
  [ "$ARM" = prism-unlimited ] && CONFIG=prism-mini.uncapped.config.json
  mkdir -p "$WT/.beholdr"
  cp "$EVAL_DIR/$CONFIG" "$WT/.beholdr/prism-mini.config.json"
fi

SKILL_VERSION=$(sed -n 's/^  version: "\(.*\)"/\1/p' "$EVAL_DIR/../SKILL.md")
SKILL_SHA=$(sha256sum "$EVAL_DIR/../SKILL.md" | cut -c1-12)
printf '%s\n' "$PROMPT" > "$OUT/prompt.txt"
cat > "$OUT/meta.json" <<EOF
{"id":"$ID","arm":"$ARM","task":"$TASK","run":$RUN,"pin":"$PIN","primary":"$PRIMARY","effort":"$EFFORT","claude":"$(claude --version | head -1)","skill_version":"$SKILL_VERSION","skill_md_sha":"$SKILL_SHA"}
EOF

# Read-only tools for everyone; edits and cargo only matter for T1.
ALLOWED=(Read Grep Glob Skill Agent Edit Write "Bash(cargo:*)" "Bash(node:*)" "Bash(git log:*)" "Bash(git diff:*)" "Bash(git status:*)" "Bash(grep:*)" "Bash(rg:*)" "Bash(ls:*)" "Bash(find:*)" "Bash(sed -n:*)" "Bash(wc:*)")

export PRISM_HOOK_LOG="$OUT/hook.jsonl"
START=$(date +%s)
set +e
case "$ARM" in
  codex-control|codex-prism)
    CODEX_ARGS=(--model "$PRIMARY" -c "model_reasoning_effort=\"$EFFORT\"" -c 'mcp_servers={}' -s read-only --json -o "$OUT/answer.md")
    [ "$ARM" = codex-control ] && CODEX_ARGS+=(-c 'agents.enabled=false')
    (cd "$WT" && timeout 45m codex exec "${CODEX_ARGS[@]}" "$PROMPT" < /dev/null) > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt"
    STATUS=$?
    ROOT=$(node -e 'for (const l of require("fs").readFileSync(process.argv[1], "utf8").split("\n")) { try { const j = JSON.parse(l); if (j.type === "thread.started") { console.log(j.thread_id); break } } catch {} }' "$OUT/stream.jsonl")
    [ -n "$ROOT" ] && node --disable-warning=ExperimentalWarning "$EVAL_DIR/codex-usage.ts" "$ROOT" > "$OUT/codex-usage.json"
    ;;
  *)
    (cd "$WT" && timeout 30m claude -p "$PROMPT" \
      --model "$PRIMARY" --effort "$EFFORT" \
      --output-format stream-json --verbose \
      --no-session-persistence --strict-mcp-config \
      --allowedTools "${ALLOWED[@]}" \
      "${EXTRA[@]}") > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt"
    STATUS=$?
    ;;
esac
set -e
echo "{\"exit\":$STATUS,\"wall_seconds\":$(( $(date +%s) - START ))}" > "$OUT/exit.json"

if [ "$TASK" = T1 ]; then
  git -C "$WT" status --porcelain > "$OUT/changed-files.txt"
  git -C "$WT" diff > "$OUT/diff.patch"
  (cd "$WT" && cargo test 2>&1) > "$OUT/cargo-test.txt" && echo pass > "$OUT/cargo-test.status" || echo fail > "$OUT/cargo-test.status"
fi

git -C "$LORE_REPO" worktree remove --force "$WT"
echo "$OUT (exit $STATUS)"
