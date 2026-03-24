#!/usr/bin/env bash
# monitor.sh — Live tmux dashboard for the code-review-fix loop

MONITOR_ENABLED=false
LOOP_START_SECONDS=${SECONDS:-0}

# Start the monitor dashboard.
# Returns 0 if monitor started, 1 if unavailable.
start_monitor() {
    local log_file="${1:-$LOG_DIR/loop.log}"
    local status_file="$LOG_DIR/status.txt"

    if ! command -v tmux &>/dev/null; then
        log "tmux not found — running without monitor"
        return 1
    fi

    MONITOR_ENABLED=true

    # Already inside tmux — split current pane
    if [[ -n "${TMUX:-}" ]]; then
        tmux split-window -h -p 35 \
            "watch -n 2 -t bash -c 'echo \"  claude-code-loops monitor\"; echo; cat \"$status_file\" 2>/dev/null || echo \"  Waiting...\"; echo; echo \"  --- Recent log ---\"; echo; tail -20 \"$log_file\" 2>/dev/null'"
        return 0
    fi

    # Not in tmux — create new session
    local session="claude-loop-$$"
    tmux new-session -d -s "$session"
    tmux split-window -h -p 35 -t "$session" \
        "watch -n 2 -t bash -c 'echo \"  claude-code-loops monitor\"; echo; cat \"$status_file\" 2>/dev/null || echo \"  Waiting...\"; echo; echo \"  --- Recent log ---\"; echo; tail -20 \"$log_file\" 2>/dev/null'"

    # Return session target for the caller to send commands to
    echo "${session}:0.0"
    return 0
}

# Update the status file atomically (called at each phase transition).
update_status() {
    local iteration="$1"
    local max_iter="$2"
    local phase="$3"
    local status_file="$LOG_DIR/status.txt"
    local tmp="${status_file}.tmp.$$"
    local elapsed=$((SECONDS - LOOP_START_SECONDS))
    local mins=$((elapsed / 60))
    local secs=$((elapsed % 60))

    cat > "$tmp" << EOF
  Iteration:    $iteration / $max_iter
  Phase:        $phase
  Elapsed:      ${mins}m ${secs}s
  Total cost:   \$${TOTAL_COST:-0}
  Last verdict: $(cat "$LOG_DIR/last-verdict.txt" 2>/dev/null || echo "pending")
EOF
    mv "$tmp" "$status_file"
}
