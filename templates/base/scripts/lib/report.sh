#!/usr/bin/env bash
# report.sh — Post-loop report generation

# Generate a markdown report summarizing the loop execution.
# Usage: generate_report <iterations_completed> <final_verdict>
generate_report() {
    local iterations_completed="$1"
    local final_verdict="$2"
    local report_file="${REPORT_FILE:-loop-report.md}"
    local elapsed=$((SECONDS - ${LOOP_START_SECONDS:-0}))

    cat > "$report_file" << EOF
# Loop Report

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')
**Task file:** ${TASK_FILE:-unknown}
**Iterations:** $iterations_completed / ${MAX_ITERATIONS:-$ITERATIONS}
**Stop reason:** $final_verdict
**Total cost:** \$${TOTAL_COST:-unknown}
**Duration:** ${elapsed}s

## Iteration Summary

EOF

    for iter_log in "$LOG_DIR"/coder-iter-*.raw.json; do
        [ -f "$iter_log" ] || continue
        local iter_num
        iter_num=$(echo "$iter_log" | grep -oE 'iter-[0-9]+' | grep -oE '[0-9]+')
        [[ -z "$iter_num" ]] && continue

        local cost turns
        cost=$(jq -r '.total_cost_usd // "?"' "$iter_log" 2>/dev/null || echo "?")
        turns=$(jq -r '.num_turns // "?"' "$iter_log" 2>/dev/null || echo "?")

        echo "### Iteration $iter_num" >> "$report_file"
        echo "" >> "$report_file"
        echo "- **Coder:** $turns turns, \$$cost" >> "$report_file"

        if [[ -f "$LOG_DIR/review-iter-$iter_num.txt" ]]; then
            if grep -qi "LGTM" "$LOG_DIR/review-iter-$iter_num.txt"; then
                echo "- **Review:** PASSED" >> "$report_file"
            else
                local issues
                issues=$(grep -c "\[CRITICAL\]\|\[HIGH\]\|\[MEDIUM\]\|\[LOW\]" \
                    "$LOG_DIR/review-iter-$iter_num.txt" 2>/dev/null || echo "0")
                echo "- **Review:** $issues issues found" >> "$report_file"
            fi
        fi
        echo "" >> "$report_file"
    done

    echo "## Files Changed" >> "$report_file"
    echo '```' >> "$report_file"
    git diff --stat "$(git log --oneline | tail -1 | cut -d' ' -f1)" HEAD 2>/dev/null \
        >> "$report_file" || echo "Unable to compute diff" >> "$report_file"
    echo '```' >> "$report_file"

    # Include remaining findings if any
    if [[ -f "${REVIEW_FILE:-review-output.md}" ]]; then
        echo "" >> "$report_file"
        echo "## Remaining Findings" >> "$report_file"
        echo "" >> "$report_file"
        cat "${REVIEW_FILE:-review-output.md}" >> "$report_file"
    fi

    log "Report written to $report_file"
}
