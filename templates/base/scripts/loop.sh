#!/usr/bin/env bash
# loop.sh — Autonomous code→review→fix loop for Claude Code
#
# Usage: bash scripts/loop.sh <task-file> [OPTIONS]
#
# Options:
#   --iterations N          Max iterations (default: 3)
#   --coder-agent NAME      Agent for coding (default: coder)
#   --reviewer-agent NAME   Agent for review (default: reviewer)
#   --coder-turns N         Max turns for coder (default: 20)
#   --reviewer-turns N      Max turns for reviewer (default: 8)
#   --no-commit             Skip auto-commit after each phase
#   --log-dir DIR           Log directory (default: .claude/logs)
#   --permission-mode MODE  Permission mode (default: acceptEdits)

set -euo pipefail

# ── Load helpers ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/rate-limit.sh"
source "$SCRIPT_DIR/lib/git-commit.sh"

# ── Parse arguments ────────────────────────────────────────
TASK_FILE=""
ITERATIONS=3
CODER_AGENT="coder"
REVIEWER_AGENT="reviewer"
CODER_TURNS=20
REVIEWER_TURNS=8
AUTO_COMMIT=true
PERMISSION_MODE="acceptEdits"
REVIEW_FILE="review-output.md"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iterations)       ITERATIONS="$2"; shift 2 ;;
    --coder-agent)      CODER_AGENT="$2"; shift 2 ;;
    --reviewer-agent)   REVIEWER_AGENT="$2"; shift 2 ;;
    --coder-turns)      CODER_TURNS="$2"; shift 2 ;;
    --reviewer-turns)   REVIEWER_TURNS="$2"; shift 2 ;;
    --no-commit)        AUTO_COMMIT=false; shift ;;
    --log-dir)          LOG_DIR="$2"; mkdir -p "$LOG_DIR"; shift 2 ;;
    --permission-mode)  PERMISSION_MODE="$2"; shift 2 ;;
    -*)                 log_error "Unknown option: $1"; exit 1 ;;
    *)
      if [ -z "$TASK_FILE" ]; then
        TASK_FILE="$1"; shift
      else
        log_error "Unexpected argument: $1"; exit 1
      fi
      ;;
  esac
done

if [ -z "$TASK_FILE" ]; then
  echo "Usage: bash scripts/loop.sh <task-file> [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --iterations N          Max iterations (default: 3)"
  echo "  --coder-agent NAME      Agent for coding (default: coder)"
  echo "  --reviewer-agent NAME   Agent for review (default: reviewer)"
  echo "  --coder-turns N         Max turns for coder (default: 20)"
  echo "  --reviewer-turns N      Max turns for reviewer (default: 8)"
  echo "  --no-commit             Skip auto-commit after each phase"
  echo "  --log-dir DIR           Log directory (default: .claude/logs)"
  echo "  --permission-mode MODE  Permission mode (default: acceptEdits)"
  exit 1
fi

if [ ! -f "$TASK_FILE" ]; then
  log_error "Task file not found: $TASK_FILE"
  exit 1
fi

TASK_CONTENT=$(cat "$TASK_FILE")

# ── Main loop ──────────────────────────────────────────────
log "Starting code→review→fix loop"
log "Task file: $TASK_FILE"
log "Iterations: $ITERATIONS"
log "Coder: $CODER_AGENT (max $CODER_TURNS turns)"
log "Reviewer: $REVIEWER_AGENT (max $REVIEWER_TURNS turns)"
log ""

for i in $(seq 1 "$ITERATIONS"); do
  log "═══ ITERATION $i/$ITERATIONS ═══"

  # ── Coder phase ──────────────────────────────────────────
  CODER_PROMPT="$TASK_CONTENT"
  if [ -f "$REVIEW_FILE" ]; then
    CODER_PROMPT="Fix ALL issues described below. After fixing, verify the build and tests pass.

--- REVIEW FINDINGS ---
$(cat "$REVIEW_FILE")

--- ORIGINAL TASK ---
$TASK_CONTENT"
  fi

  log "Coder phase..."
  run_with_retry claude -p "$CODER_PROMPT" \
    --agent "$CODER_AGENT" \
    --max-turns "$CODER_TURNS" \
    --permission-mode "$PERMISSION_MODE" \
    --output-format json \
    > "$LOG_DIR/coder-iter-$i.json" 2>&1 || {
      log_error "Coder failed on iteration $i"
      exit 1
    }

  # ── Auto-commit ──────────────────────────────────────────
  if [ "$AUTO_COMMIT" = true ]; then
    auto_commit "iteration-$i/code"
  fi

  # ── Reviewer phase ───────────────────────────────────────
  log "Reviewer phase..."
  DIFF=$(git diff HEAD~1 2>/dev/null || git diff)

  REVIEW_OUTPUT=$(echo "$DIFF" | claude -p \
    "Review these code changes thoroughly. Check for bugs, security issues, type safety, and code quality.
If everything is acceptable, respond with exactly 'LGTM'.
Otherwise, list all findings with severity, file, line, and description." \
    --agent "$REVIEWER_AGENT" \
    --max-turns "$REVIEWER_TURNS" \
    --permission-mode "$PERMISSION_MODE" \
    --output-format text 2>/dev/null) || REVIEW_OUTPUT="Review failed — treating as LGTM"

  echo "$REVIEW_OUTPUT" > "$LOG_DIR/review-iter-$i.txt"

  # ── Check verdict ────────────────────────────────────────
  if echo "$REVIEW_OUTPUT" | grep -qi "LGTM"; then
    log "Review PASSED on iteration $i"
    rm -f "$REVIEW_FILE"

    if [ "$AUTO_COMMIT" = true ]; then
      auto_commit "iteration-$i/review-passed"
    fi
    break
  fi

  log "Review found issues — writing to $REVIEW_FILE"
  echo "$REVIEW_OUTPUT" > "$REVIEW_FILE"

  if [ "$AUTO_COMMIT" = true ]; then
    auto_commit "iteration-$i/review-findings"
  fi

  if [ "$i" -eq "$ITERATIONS" ]; then
    log "Max iterations reached. Review findings saved in $REVIEW_FILE"
  fi
done

log "Loop complete after $i iteration(s)"
