# Loop Robustness Design

## Context

The loop orchestration (loop.sh + lib/*.sh) has several reliability issues discovered during real usage: piped exit codes masking claude failures, logs overwriting across runs, cost tracking missing reviewer calls, no timeout protection, and various medium-severity edge cases. This spec addresses all 12 identified issues.

## 1. Per-run log directories

Each run creates a timestamped subdirectory under `.claude/ccl/logs/`:

```
.claude/ccl/
  ccl.json
  plans/
  logs/
    2026-03-26-143022/
      loop.log
      coder-iter-1.raw.json
      coder-iter-1.txt
      coder-iter-1.stderr
      review-iter-1.raw.json
      review-iter-1.txt
      review-output.md
      loop-report.md
    latest -> 2026-03-26-143022/
```

- `loop.sh` creates the timestamped dir at startup, sets `LOG_DIR` to it
- A `latest` symlink (or copy on Windows) is updated to point to the current run
- `ccl history` scans subdirectories sorted by name (newest first), `--last N` limits output
- Fallback: if flat `.claude/logs/` exists with old-style files, read those for backward compat

### ccl.json migration

Move config from `.claude/ccl.json` to `.claude/ccl/ccl.json`. Read new location first, fall back to old, write to new. Old file is not deleted (user can clean up manually).

**Files:** `loop.sh`, `logging.sh`, `src/commands/history.ts`, `src/utils/ccl-config.ts`, `src/commands/run.ts`

## 2. Fix piped exit codes + raw output capture

Replace `claude ... | node stream-filter > output.txt` with a two-step process:

```bash
# Step 1: Run claude, capture raw output and exit code
timeout "${PHASE_TIMEOUT}" claude -p "$PROMPT" \
  --agent "$AGENT" \
  --max-turns "$TURNS" \
  --max-budget-usd "$PHASE_BUDGET" \
  --output-format stream-json --verbose \
  > "$LOG_DIR/coder-iter-$i.raw.json" \
  2>"$LOG_DIR/coder-iter-$i.stderr"
CLAUDE_EXIT=$?

# Step 2: Check exit code
if [ $CLAUDE_EXIT -ne 0 ]; then
  log_error "Coder failed (exit $CLAUDE_EXIT)"
  STOP_REASON="coder_failure"
  break
fi

# Step 3: Filter for display (non-fatal)
node "$CCL_STREAM_FILTER" < "$LOG_DIR/coder-iter-$i.raw.json" \
  > "$LOG_DIR/coder-iter-$i.txt" 2>/dev/null || true

# Step 4: Extract cost from raw JSON
extract_cost "$LOG_DIR/coder-iter-$i.raw.json"
```

Same pattern for reviewer phase.

**Files:** `loop.sh`

## 3. Cost tracking + timeout protection

### Per-phase limits (new ccl.json fields)

```json
{
  "loop": {
    "coderBudget": 2.00,
    "reviewerBudget": 1.00,
    "phaseTimeout": "10m"
  }
}
```

- `coderBudget` / `reviewerBudget` — passed as `--max-budget-usd` to claude per call
- `phaseTimeout` — passed to bash `timeout` command per call
- These are separate from the existing cumulative `tokenBudget` and `timeLimit`

### Cost extraction function

```bash
extract_cost() {
  local raw_file="$1"
  local cost=0
  cost=$(jq -s '[.[] | select(.type == "result") | .cost_usd // .total_cost_usd // 0] | add // 0' \
    "$raw_file" 2>/dev/null) || cost=0
  TOTAL_COST=$(echo "$TOTAL_COST + $cost" | bc)
  log "Cost this call: \$${cost} | Cumulative: \$${TOTAL_COST}"
}
```

- Called after both coder AND reviewer phases
- Parses stream-json format (array of events, extract result event)
- Tries multiple field names for forward compatibility

### CLI flags

Add `--coder-budget`, `--reviewer-budget`, `--phase-timeout` to both `loop.sh` and `ccl run` / `ccl config`.

**Files:** `loop.sh`, `stopping.sh`, `src/utils/ccl-config.ts`, `src/commands/run.ts`, `src/commands/config.ts`, `src/index.ts`

## 4. Zero-diff counter fix

Track diff hash instead of just empty/non-empty:

```bash
LAST_DIFF_HASH=""
check_zero_diff() {
  local current_hash
  current_hash=$(git diff HEAD --stat | md5sum | cut -d' ' -f1)
  if [[ "$current_hash" == "$LAST_DIFF_HASH" ]]; then
    ZERO_DIFF_COUNT=$((ZERO_DIFF_COUNT + 1))
  else
    ZERO_DIFF_COUNT=0
  fi
  LAST_DIFF_HASH="$current_hash"
  [[ $ZERO_DIFF_COUNT -ge 2 ]]
}
```

Catches both "no changes at all" and "same changes oscillating."

**Files:** `stopping.sh`

## 5. Build gate preserves error context

Stop deleting `build_errors.txt` after reading. The file persists across iterations so repeated build failures still have context for the coder. Overwrite (not delete) at the start of each build gate check.

**Files:** `stopping.sh`, `loop.sh`

## 6. Auto-commit error handling

Check return codes from `git add` and `git commit`. Log failures instead of swallowing them:

```bash
auto_commit() {
  local prefix="${1:-auto}"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    if ! git add -A 2>"$LOG_DIR/git-error.txt"; then
      log_error "git add failed: $(cat "$LOG_DIR/git-error.txt")"
      return 1
    fi
    if ! git commit -m "${prefix}: automated pass at $(date '+%H:%M:%S')" --no-verify 2>"$LOG_DIR/git-error.txt"; then
      log_error "git commit failed: $(cat "$LOG_DIR/git-error.txt")"
      return 1
    fi
    log "Committed: ${prefix}"
  fi
}
```

Callers in loop.sh should check the return code and log warnings (not halt — a commit failure shouldn't stop the loop).

**Files:** `git-commit.sh`, `loop.sh`

## 7. Rate-limit retry improvements

- Exponential backoff: 30s, 60s, 120s instead of fixed 300s/30s
- Better detection: check exit code 75 OR grep for "rate limit", "429", "overloaded" in stderr (not stdout, to avoid matching user code)
- Keep each retry's output in separate temp files for debugging
- Clean up temp files on exit via `trap`

**Files:** `rate-limit.sh`

## 8. Report generation hardening

- Write to a temp file, then `mv` atomically to final path
- Use `git diff --stat $(git rev-list --max-parents=0 HEAD)..HEAD` with error handling for the diff summary
- Guard against half-written JSON files with `jq` error suppression

**Files:** `report.sh`

## 9. Signal handling

### loop.sh
Add `trap` for SIGINT/SIGTERM that:
- Writes a final log entry ("Loop interrupted at iteration N")
- Sets `STOP_REASON="interrupted"`
- Generates a partial report
- Exits cleanly

### run.ts
Add temp file cleanup to signal handlers. Write interruption status so `ccl history` can show it.

**Files:** `loop.sh`, `src/commands/run.ts`

## 10. Temp file cleanup

- `rate-limit.sh`: use `trap 'rm -f $TMPFILES' EXIT` to clean up on any exit
- `run.ts`: clean up task temp file in signal handlers, not just on normal close

**Files:** `rate-limit.sh`, `src/commands/run.ts`

## Files summary

| File | Changes |
|------|---------|
| `templates/base/scripts/loop.sh` | Per-run log dirs, two-step claude execution, timeout/budget flags, signal trapping, auto-commit error checking |
| `templates/base/scripts/lib/logging.sh` | No append mode change needed (each run has its own dir now) |
| `templates/base/scripts/lib/stopping.sh` | Zero-diff hash tracking, cost extraction function, build error preservation |
| `templates/base/scripts/lib/git-commit.sh` | Error handling for git add/commit |
| `templates/base/scripts/lib/rate-limit.sh` | Exponential backoff, better detection, temp file cleanup |
| `templates/base/scripts/lib/report.sh` | Atomic write, git diff hardening |
| `src/utils/ccl-config.ts` | New fields (coderBudget, reviewerBudget, phaseTimeout), migration to .claude/ccl/ |
| `src/commands/run.ts` | Pass new flags to loop.sh, signal cleanup, resolve log dir |
| `src/commands/config.ts` | New config options |
| `src/commands/history.ts` | Scan per-run subdirectories, backward compat with flat dir |
| `src/commands/status.ts` | Update config path |
| `src/commands/doctor.ts` | Check new .claude/ccl/ path |
| `src/commands/upgrade.ts` | Update paths |
| `src/index.ts` | New CLI flags |

## Backward compatibility

- `ccl.json`: read from `.claude/ccl/ccl.json` first, fall back to `.claude/ccl.json`
- Logs: if `.claude/logs/` exists with flat files (no subdirs), read those for history
- New ccl.json fields default to sensible values if absent (coderBudget: 2.00, reviewerBudget: 1.00, phaseTimeout: "10m")
