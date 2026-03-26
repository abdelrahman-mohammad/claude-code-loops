#!/usr/bin/env bash
# stopping.sh — Composable stopping conditions for the code→review→fix loop

# ── State variables ────────────────────────────────────────
PREV_ERROR_HASH=""
CONSECUTIVE_SAME_ERRORS=0
ZERO_DIFF_COUNT=0
LAST_DIFF_HASH=""
TOTAL_COST=0
SHOULD_EXIT=false

trap 'log "Received SIGTERM/SIGINT — finishing current iteration"; SHOULD_EXIT=true' SIGTERM SIGINT

# ── Cost extraction ────────────────────────────────────────
extract_cost() {
  local raw_file="$1"
  local cost=0

  if [ -f "$raw_file" ] && command -v jq &>/dev/null; then
    cost=$(jq -s '[.[] | select(.type == "result") | .cost_usd // .total_cost_usd // 0] | add // 0' \
      "$raw_file" 2>/dev/null) || cost=0
    [[ -z "$cost" || "$cost" == "null" ]] && cost=0
  fi

  TOTAL_COST=$(echo "${TOTAL_COST:-0} + $cost" | bc 2>/dev/null || echo "${TOTAL_COST:-0}")
  log "Cost this call: \$${cost} | Cumulative: \$${TOTAL_COST}"
}

# ── Smart stop: tests pass + LGTM ─────────────────────────
smart_stop_check() {
    local test_exit="$1"
    local review_output="$2"

    if [[ $test_exit -eq 0 ]] && echo "$review_output" | grep -qiE "(LGTM|looks good to me|no issues found|PASS_WITH_SUGGESTIONS|Verdict:.*PASS)"; then
        log "SMART STOP: Tests pass AND review approved"
        return 0
    fi
    return 1
}

# ── No-progress circuit breaker ────────────────────────────
check_no_progress() {
    local current_output="$1"
    local threshold="${NO_PROGRESS_THRESHOLD:-3}"
    local current_hash
    current_hash=$(echo "$current_output" | md5sum | cut -d' ' -f1)

    if [[ "$current_hash" == "$PREV_ERROR_HASH" ]]; then
        CONSECUTIVE_SAME_ERRORS=$((CONSECUTIVE_SAME_ERRORS + 1))
        if [[ $CONSECUTIVE_SAME_ERRORS -ge $threshold ]]; then
            log "CIRCUIT BREAKER: Same error repeated $threshold times"
            return 0
        fi
    else
        CONSECUTIVE_SAME_ERRORS=0
    fi
    PREV_ERROR_HASH="$current_hash"
    return 1
}

# ── Zero-diff detection (hash-based, catches oscillation) ─
check_zero_diff() {
    local current_hash
    current_hash=$(git diff HEAD --stat 2>/dev/null | md5sum 2>/dev/null | cut -d' ' -f1)
    # Fallback if md5sum not available
    [[ -z "$current_hash" ]] && current_hash=$(git diff HEAD --stat 2>/dev/null | sha256sum 2>/dev/null | cut -d' ' -f1)
    [[ -z "$current_hash" ]] && current_hash="empty"

    if [[ "$current_hash" == "$LAST_DIFF_HASH" ]]; then
        ZERO_DIFF_COUNT=$((ZERO_DIFF_COUNT + 1))
        if [[ $ZERO_DIFF_COUNT -ge 2 ]]; then
            log "ZERO-DIFF: Same diff state for $ZERO_DIFF_COUNT consecutive iterations"
            return 0
        fi
        log "Same diff state detected — retrying (attempt $ZERO_DIFF_COUNT/2)"
    else
        ZERO_DIFF_COUNT=0
    fi

    LAST_DIFF_HASH="$current_hash"
    return 1
}

# ── Compilation gate ───────────────────────────────────────
detect_build_command() {
    if [[ -f "package.json" ]] && grep -q '"build"' package.json; then
        echo "npm run build"
    elif [[ -f "pyproject.toml" ]] || [[ -f "setup.py" ]]; then
        echo "python -m py_compile app/main.py && ruff check . --select E"
    elif [[ -f "go.mod" ]]; then
        echo "go build ./..."
    elif [[ -f "Cargo.toml" ]]; then
        echo "cargo build"
    elif [[ -f "pom.xml" ]]; then
        echo "mvn compile -q"
    else
        echo ""
    fi
}

compilation_gate() {
    local build_cmd
    build_cmd=$(detect_build_command)
    [[ -z "$build_cmd" ]] && return 0

    # Overwrite previous errors at the start of each gate check
    > "$LOG_DIR/build_errors.txt"

    local build_output
    build_output=$(eval "$build_cmd" 2>&1)
    local build_exit=$?

    if [[ $build_exit -ne 0 ]]; then
        log "BUILD FAILED — skipping reviewer, feeding errors to coder"
        echo "$build_output" > "$LOG_DIR/build_errors.txt"
        return 1
    fi
    return 0
}

# ── Coverage extraction ────────────────────────────────────
extract_coverage() {
    # Jest: coverage/coverage-summary.json
    if [[ -f "coverage/coverage-summary.json" ]]; then
        jq '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null && return
    fi

    # pytest-cov: coverage.json
    if [[ -f "coverage.json" ]]; then
        jq '.totals.percent_covered' coverage.json 2>/dev/null && return
    fi

    # JaCoCo CSV
    if [[ -f "target/site/jacoco/jacoco.csv" ]]; then
        tail -n +2 target/site/jacoco/jacoco.csv | awk -F',' \
            '{missed+=$8; covered+=$9} END {printf "%.2f\n", covered*100/(covered+missed)}' && return
    fi

    echo ""
}

check_coverage_threshold() {
    local threshold="$1"
    local current
    current=$(extract_coverage)

    if [[ -n "$current" ]] && [[ "$current" != "null" ]]; then
        if (( $(echo "$current >= $threshold" | bc -l) )); then
            log "Coverage ${current}% meets threshold ${threshold}%"
            return 0
        fi
        log "Coverage ${current}% below threshold ${threshold}%"
    fi
    return 1
}

# ── Budget tracking ────────────────────────────────────────
track_and_check_budget() {
    local json_output="$1"
    local max_budget="$2"

    local cost
    cost=$(echo "$json_output" | jq '.total_cost_usd // .cost_usd // 0' 2>/dev/null)
    [[ -z "$cost" || "$cost" == "null" ]] && cost=0
    TOTAL_COST=$(echo "$TOTAL_COST + $cost" | bc)

    log "Cost this call: \$${cost} | Cumulative: \$${TOTAL_COST}"

    if [[ -n "$max_budget" ]] && (( $(echo "$TOTAL_COST >= $max_budget" | bc -l) )); then
        log "BUDGET EXCEEDED: \$${TOTAL_COST} >= \$${max_budget}"
        return 0
    fi
    return 1
}

# ── Time limit ─────────────────────────────────────────────
check_time_limit() {
    local max_duration="${MAX_DURATION:-0}"
    if [[ $max_duration -gt 0 ]] && [[ $SECONDS -ge $max_duration ]]; then
        log "TIME LIMIT: ${SECONDS}s elapsed (limit: ${max_duration}s)"
        return 0
    fi
    [[ "$SHOULD_EXIT" == true ]] && return 0
    return 1
}

# ── Composable evaluator ──────────────────────────────────
check_all_stop_conditions() {
    local test_exit="${1:-1}"
    local review_output="$2"
    local coder_json="$3"

    # Hard limits (check first)
    [[ -n "$TOKEN_BUDGET" ]] && track_and_check_budget "$coder_json" "$TOKEN_BUDGET" && return 0
    check_time_limit && return 0

    # Smart success gate
    [[ "$STOP_ON_PASS" == true ]] && smart_stop_check "$test_exit" "$review_output" && return 0

    # Coverage gate (only if tests pass)
    [[ -n "$COVERAGE_THRESHOLD" ]] && [[ "$test_exit" -eq 0 ]] && \
        check_coverage_threshold "$COVERAGE_THRESHOLD" && return 0

    # Failure/stuck gates
    [[ "$STOP_ON_NO_PROGRESS" == true ]] && check_no_progress "$review_output" && return 0
    [[ "$ZERO_DIFF_HALT" == true ]] && check_zero_diff && return 0

    return 1
}
