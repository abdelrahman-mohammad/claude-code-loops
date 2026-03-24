#!/usr/bin/env bash
# loop.sh — Autonomous code-review-fix loop for Claude Code
#
# Usage: bash scripts/loop.sh <task-file> [OPTIONS]
#
# Stopping conditions (defaults in brackets):
#   --iterations N              Hard iteration ceiling [10]
#   --stop-on-pass              Exit when tests pass + LGTM [ON]
#   --no-stop-on-pass           Disable smart stop
#   --stop-on-no-progress       Circuit breaker for stuck agents [ON]
#   --no-stop-on-no-progress    Disable circuit breaker
#   --no-progress-threshold N   Same-error repeats before halt [3]
#   --build-gate                Skip reviewer on build failure [ON]
#   --no-build-gate             Disable build gate
#   --zero-diff-halt            Halt on no changes (1 retry) [ON]
#   --no-zero-diff-halt         Disable zero-diff detection
#   --coverage-threshold PCT    Stop when coverage >= PCT% [OFF]
#   --token-budget USD          Cost ceiling across iterations [OFF]
#   --time-limit SECONDS        Wall-clock timeout [OFF]
#
# Agent and execution options:
#   --coder-agent NAME          Agent for coding [coder]
#   --reviewer-agent NAME       Agent for review [reviewer]
#   --coder-turns N             Max turns for coder [20]
#   --reviewer-turns N          Max turns for reviewer [8]
#   --no-commit                 Skip auto-commit after each phase
#   --log-dir DIR               Log directory [.claude/logs]
#   --permission-mode MODE      Permission mode [acceptEdits]
#   --monitor                   Live tmux dashboard [OFF]
#   --report <file>             Generate post-loop report [loop-report.md]
#   --no-report                 Skip report generation

set -euo pipefail

# ── Load helpers ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/rate-limit.sh"
source "$SCRIPT_DIR/lib/git-commit.sh"
source "$SCRIPT_DIR/lib/stopping.sh"
source "$SCRIPT_DIR/lib/monitor.sh"
source "$SCRIPT_DIR/lib/report.sh"

# ── Defaults ───────────────────────────────────────────────
TASK_FILE=""
ITERATIONS=10
CODER_AGENT="coder"
REVIEWER_AGENT="reviewer"
CODER_TURNS=20
REVIEWER_TURNS=8
AUTO_COMMIT=true
PERMISSION_MODE="acceptEdits"
REVIEW_FILE="review-output.md"
ENABLE_MONITOR=false
REPORT_FILE="loop-report.md"
ENABLE_REPORT=true

# Stopping condition defaults
STOP_ON_PASS=true
STOP_ON_NO_PROGRESS=true
NO_PROGRESS_THRESHOLD=3
BUILD_GATE=true
ZERO_DIFF_HALT=true
COVERAGE_THRESHOLD=""
TOKEN_BUDGET=""
MAX_DURATION=0

# ── Parse arguments ────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --iterations)              ITERATIONS="$2"; shift 2 ;;
    --coder-agent)             CODER_AGENT="$2"; shift 2 ;;
    --reviewer-agent)          REVIEWER_AGENT="$2"; shift 2 ;;
    --coder-turns)             CODER_TURNS="$2"; shift 2 ;;
    --reviewer-turns)          REVIEWER_TURNS="$2"; shift 2 ;;
    --no-commit)               AUTO_COMMIT=false; shift ;;
    --log-dir)                 LOG_DIR="$2"; mkdir -p "$LOG_DIR"; shift 2 ;;
    --permission-mode)         PERMISSION_MODE="$2"; shift 2 ;;
    --stop-on-pass)            STOP_ON_PASS=true; shift ;;
    --no-stop-on-pass)         STOP_ON_PASS=false; shift ;;
    --stop-on-no-progress)     STOP_ON_NO_PROGRESS=true; shift ;;
    --no-stop-on-no-progress)  STOP_ON_NO_PROGRESS=false; shift ;;
    --no-progress-threshold)   NO_PROGRESS_THRESHOLD="$2"; shift 2 ;;
    --build-gate)              BUILD_GATE=true; shift ;;
    --no-build-gate)           BUILD_GATE=false; shift ;;
    --zero-diff-halt)          ZERO_DIFF_HALT=true; shift ;;
    --no-zero-diff-halt)       ZERO_DIFF_HALT=false; shift ;;
    --coverage-threshold)      COVERAGE_THRESHOLD="$2"; shift 2 ;;
    --token-budget)            TOKEN_BUDGET="$2"; shift 2 ;;
    --time-limit)              MAX_DURATION="$2"; shift 2 ;;
    --monitor)                 ENABLE_MONITOR=true; shift ;;
    --report)                  REPORT_FILE="$2"; ENABLE_REPORT=true; shift 2 ;;
    --no-report)               ENABLE_REPORT=false; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    -*)                        log_error "Unknown option: $1"; exit 1 ;;
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
  sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
  exit 1
fi

if [ ! -f "$TASK_FILE" ]; then
  log_error "Task file not found: $TASK_FILE"
  exit 1
fi

TASK_CONTENT=$(cat "$TASK_FILE")

# ── Main loop ──────────────────────────────────────────────
log "Starting code-review-fix loop"
log "Task file: $TASK_FILE"
log "Max iterations: $ITERATIONS | Coder: $CODER_AGENT ($CODER_TURNS turns) | Reviewer: $REVIEWER_AGENT ($REVIEWER_TURNS turns)"
log "Stop-on-pass: $STOP_ON_PASS | No-progress: $STOP_ON_NO_PROGRESS (threshold: $NO_PROGRESS_THRESHOLD) | Build-gate: $BUILD_GATE | Zero-diff: $ZERO_DIFF_HALT"
[[ -n "$TOKEN_BUDGET" ]] && log "Token budget: \$$TOKEN_BUDGET"
[[ $MAX_DURATION -gt 0 ]] && log "Time limit: ${MAX_DURATION}s"
[[ -n "$COVERAGE_THRESHOLD" ]] && log "Coverage threshold: ${COVERAGE_THRESHOLD}%"
log ""

STOP_REASON=""
LAST_ITERATION=0

# Start monitor if requested
if [ "$ENABLE_MONITOR" = true ]; then
  start_monitor "$LOG_DIR/loop.log" || true
fi

for i in $(seq 1 "$ITERATIONS"); do
  LAST_ITERATION=$i
  log "=== ITERATION $i/$ITERATIONS ==="
  [ "$MONITOR_ENABLED" = true ] && update_status "$i" "$ITERATIONS" "starting"

  # ── Coder phase ──────────────────────────────────────────
  CODER_PROMPT="$TASK_CONTENT"
  if [ -f "$LOG_DIR/build_errors.txt" ]; then
    CODER_PROMPT="The build is failing. Fix these errors first, then continue with the task.

--- BUILD ERRORS ---
$(cat "$LOG_DIR/build_errors.txt")

--- ORIGINAL TASK ---
$TASK_CONTENT"
    rm -f "$LOG_DIR/build_errors.txt"
  elif [ -f "$REVIEW_FILE" ]; then
    CODER_PROMPT="Fix ALL issues described below. After fixing, verify the build and tests pass.

--- REVIEW FINDINGS ---
$(cat "$REVIEW_FILE")

--- ORIGINAL TASK ---
$TASK_CONTENT"
  fi

  log "Coder phase..."
  [ "$MONITOR_ENABLED" = true ] && update_status "$i" "$ITERATIONS" "coder"
  CODER_OUTPUT=""
  if run_with_retry claude -p "$CODER_PROMPT" \
    --agent "$CODER_AGENT" \
    --max-turns "$CODER_TURNS" \
    --permission-mode "$PERMISSION_MODE" \
    --output-format json \
    > "$LOG_DIR/coder-iter-$i.json" 2>&1; then
    CODER_OUTPUT=$(cat "$LOG_DIR/coder-iter-$i.json")
  else
    log_error "Coder failed on iteration $i"
    STOP_REASON="coder_failure"
    break
  fi

  # ── Auto-commit ──────────────────────────────────────────
  if [ "$AUTO_COMMIT" = true ]; then
    auto_commit "iteration-$i/code"
  fi

  # ── Build gate (skip reviewer if build fails) ────────────
  if [ "$BUILD_GATE" = true ]; then
    if ! compilation_gate; then
      log "Skipping reviewer — feeding build errors to next coder iteration"
      if [ "$AUTO_COMMIT" = true ]; then
        auto_commit "iteration-$i/build-failed"
      fi

      # Check hard stop conditions even on build failure
      if check_time_limit; then
        STOP_REASON="time_limit"; break
      fi
      [[ -n "$TOKEN_BUDGET" ]] && track_and_check_budget "$CODER_OUTPUT" "$TOKEN_BUDGET" && { STOP_REASON="budget"; break; }
      continue
    fi
  fi

  # ── Reviewer phase ───────────────────────────────────────
  log "Reviewer phase..."
  [ "$MONITOR_ENABLED" = true ] && update_status "$i" "$ITERATIONS" "reviewer"
  DIFF=$(git diff HEAD~1 2>/dev/null || git diff)

  REVIEW_OUTPUT=$(echo "$DIFF" | claude -p \
    "Review these code changes thoroughly. Check for bugs, security issues, type safety, and code quality.
If everything is acceptable, respond with exactly 'LGTM'.
Otherwise, list all findings with severity, file, line, and description." \
    --agent "$REVIEWER_AGENT" \
    --max-turns "$REVIEWER_TURNS" \
    --permission-mode "$PERMISSION_MODE" \
    --output-format text 2>/dev/null) || REVIEW_OUTPUT="Review failed — treating as needs changes"

  echo "$REVIEW_OUTPUT" > "$LOG_DIR/review-iter-$i.txt"

  # ── Run tests for smart stop check ───────────────────────
  TEST_EXIT=1
  if [ "$STOP_ON_PASS" = true ] || [ -n "$COVERAGE_THRESHOLD" ]; then
    BUILD_CMD=$(detect_build_command)
    if [ -n "$BUILD_CMD" ]; then
      eval "$BUILD_CMD" > /dev/null 2>&1 && TEST_EXIT=0 || TEST_EXIT=1
    fi
  fi

  # ── Check all stopping conditions ────────────────────────
  if check_all_stop_conditions "$TEST_EXIT" "$REVIEW_OUTPUT" "$CODER_OUTPUT"; then
    STOP_REASON="smart_stop"
    rm -f "$REVIEW_FILE"
    if [ "$AUTO_COMMIT" = true ]; then
      auto_commit "iteration-$i/passed"
    fi
    break
  fi

  # ── Continue: save review findings for next iteration ────
  log "Review found issues — continuing to iteration $((i + 1))"
  echo "$REVIEW_OUTPUT" > "$REVIEW_FILE"

  if [ "$AUTO_COMMIT" = true ]; then
    auto_commit "iteration-$i/review-findings"
  fi
done

# ── Summary ────────────────────────────────────────────────
log ""
log "=== LOOP COMPLETE ==="
log "Iterations: $LAST_ITERATION/$ITERATIONS"
if [ -n "$STOP_REASON" ]; then
  log "Stop reason: $STOP_REASON"
else
  log "Stop reason: max_iterations"
fi
[[ -f "$REVIEW_FILE" ]] && log "Remaining findings saved in $REVIEW_FILE"
log "Cumulative cost: \$$TOTAL_COST"
log "Elapsed time: ${SECONDS}s"

# Generate report
if [ "$ENABLE_REPORT" = true ]; then
  FINAL_VERDICT="${STOP_REASON:-max_iterations}"
  generate_report "$LAST_ITERATION" "$FINAL_VERDICT"
fi

[ "$MONITOR_ENABLED" = true ] && update_status "$LAST_ITERATION" "$ITERATIONS" "complete"
