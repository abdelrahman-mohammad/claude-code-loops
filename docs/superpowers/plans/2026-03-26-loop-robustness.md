# Loop Robustness Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix 12 reliability issues in loop orchestration — piped exit codes, log overwriting, cost tracking, timeouts, and edge cases.

**Architecture:** Bash scripts get per-run log dirs, two-step claude execution, and hardened error handling. TypeScript gets config migration to `.claude/ccl/`, new budget/timeout fields, and history rewrite.

**Spec:** `docs/superpowers/specs/2026-03-26-loop-robustness-design.md`

---

### Task 1: Migrate ccl.json to .claude/ccl/

**Files:**
- Modify: `src/utils/ccl-config.ts`
- Modify: `src/commands/status.ts`
- Modify: `src/commands/doctor.ts`
- Modify: `tests/unit/ccl-config.test.ts`

- [ ] Update `readCclConfig` to try `.claude/ccl/ccl.json` first, fall back to `.claude/ccl.json`
- [ ] Update `writeCclConfig` to write to `.claude/ccl/ccl.json` (create dir if needed)
- [ ] Update `status.ts` and `doctor.ts` for new path
- [ ] Update unit tests, add backward compat test
- [ ] Run `npm run build && npm test`
- [ ] Commit: `refactor: migrate ccl.json to .claude/ccl/ directory`

---

### Task 2: Add new config fields (coderBudget, reviewerBudget, phaseTimeout)

**Files:**
- Modify: `src/utils/ccl-config.ts`
- Modify: `src/commands/config.ts`
- Modify: `src/commands/run.ts`
- Modify: `src/index.ts`

- [ ] Add `coderBudget: number | null`, `reviewerBudget: number | null`, `phaseTimeout: string | null` to `CclConfig.loop` and `DEFAULT_CONFIG`
- [ ] Add `--coder-budget`, `--reviewer-budget`, `--phase-timeout` flags to config and run commands
- [ ] Pass new flags to loop.sh args in run.ts
- [ ] Register flags in index.ts
- [ ] Run `npm run build && npm test`
- [ ] Commit: `feat: add per-phase budget and timeout config options`

---

### Task 3: Per-run log directories in loop.sh

**Files:**
- Modify: `templates/base/scripts/loop.sh`

- [ ] At startup, create timestamped log dir: `LOG_DIR=".claude/ccl/logs/$(date '+%Y-%m-%d-%H%M%S')"`, `mkdir -p "$LOG_DIR"`
- [ ] Create `latest` symlink: `ln -sfn "$(basename "$LOG_DIR")" ".claude/ccl/logs/latest"`
- [ ] Update all `$LOG_DIR` references (should already use the variable)
- [ ] Parse `--log-dir` flag to allow override
- [ ] Commit: `feat: use per-run timestamped log directories`

---

### Task 4: Two-step claude execution (fix piped exit codes)

**Files:**
- Modify: `templates/base/scripts/loop.sh`

- [ ] Replace coder pipe with two-step: write raw to `coder-iter-$i.raw.json`, check exit code, filter separately
- [ ] Add `timeout "$PHASE_TIMEOUT"` wrapper (default "10m"), parse `--phase-timeout` flag
- [ ] Add `--max-budget-usd "$CODER_BUDGET"` to claude calls, parse `--coder-budget`/`--reviewer-budget` flags
- [ ] Apply same two-step pattern to reviewer phase
- [ ] Commit: `fix: capture claude exit codes directly, add timeout and budget protection`

---

### Task 5: Cost extraction and tracking

**Files:**
- Modify: `templates/base/scripts/lib/stopping.sh`
- Modify: `templates/base/scripts/loop.sh`

- [ ] Add `extract_cost()` function to stopping.sh — parse stream-json for `.cost_usd` / `.total_cost_usd`
- [ ] Call `extract_cost` after both coder AND reviewer in loop.sh
- [ ] Initialize `TOTAL_COST=0` properly
- [ ] Commit: `fix: track costs for both coder and reviewer phases`

---

### Task 6: Zero-diff hash tracking

**Files:**
- Modify: `templates/base/scripts/lib/stopping.sh`

- [ ] Replace `check_zero_diff` with hash-based: `md5sum` of `git diff HEAD --stat`, compare to `LAST_DIFF_HASH`
- [ ] Commit: `fix: use diff hash for zero-diff detection`

---

### Task 7: Build gate error preservation

**Files:**
- Modify: `templates/base/scripts/lib/stopping.sh`
- Modify: `templates/base/scripts/loop.sh`

- [ ] Stop deleting `build_errors.txt` after reading — overwrite at start of each check instead
- [ ] Ensure coder prompt includes persisted build errors
- [ ] Commit: `fix: preserve build errors across iterations`

---

### Task 8: Auto-commit error handling

**Files:**
- Modify: `templates/base/scripts/lib/git-commit.sh`
- Modify: `templates/base/scripts/loop.sh`

- [ ] Add stderr capture and error checking to `git add` and `git commit`
- [ ] Return 1 on failure, log errors
- [ ] Check return code at each call site in loop.sh, log warning but don't halt
- [ ] Commit: `fix: handle git commit errors instead of swallowing them`

---

### Task 9: Rate-limit retry improvements

**Files:**
- Modify: `templates/base/scripts/lib/rate-limit.sh`

- [ ] Exponential backoff: 30s, 60s, 120s
- [ ] Check stderr for "rate limit", "429", "overloaded" (not stdout)
- [ ] Separate temp files per retry
- [ ] Add `trap 'rm -f $TMPFILES' EXIT` cleanup
- [ ] Commit: `fix: improve rate-limit retry with exponential backoff`

---

### Task 10: Report generation hardening

**Files:**
- Modify: `templates/base/scripts/lib/report.sh`

- [ ] Write to temp file, `mv` atomically
- [ ] Fix git diff edge cases (no commits, single commit)
- [ ] Guard `jq` against half-written JSON
- [ ] Commit: `fix: harden report generation with atomic writes`

---

### Task 11: Signal handling

**Files:**
- Modify: `templates/base/scripts/loop.sh`
- Modify: `src/commands/run.ts`

- [ ] In loop.sh, add `trap` for SIGINT/SIGTERM: log interruption, set `STOP_REASON="interrupted"`, generate partial report
- [ ] In run.ts, clean up temp files in signal handlers
- [ ] Commit: `fix: handle signals gracefully with cleanup and partial reports`

---

### Task 12: Temp file cleanup

**Files:**
- Modify: `templates/base/scripts/lib/rate-limit.sh`
- Modify: `src/commands/run.ts`

- [ ] Add EXIT trap for temp files in rate-limit.sh (skip if already done in Task 9)
- [ ] Move temp task file cleanup in run.ts to shared function used by both close handler and signal handlers
- [ ] Commit: `fix: clean up temp files on all exit paths`

---

### Task 13: Rewrite history for per-run directories

**Files:**
- Modify: `src/commands/history.ts`
- Modify: `tests/unit/history.test.ts`

- [ ] Rewrite `scanLogDirectory` to scan `.claude/ccl/logs/` for timestamped subdirs
- [ ] Each subdir is one run, sort by name descending
- [ ] Add backward compat: fall back to flat `.claude/logs/`
- [ ] Update tests, add multi-run scanning test
- [ ] Run `npm run build && npm test`
- [ ] Commit: `feat: rewrite history to scan per-run log directories`

---

### Task 14: Update docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] Add entries to CHANGELOG for all fixes
- [ ] Update README with new config options and `.claude/ccl/` structure
- [ ] Commit: `docs: update changelog and readme for loop robustness improvements`
