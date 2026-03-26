#!/usr/bin/env bash
# report.sh — Post-loop report generation

# Generate a markdown report summarizing the loop execution.
# Usage: generate_report <iterations_completed> <final_verdict>
generate_report() {
    local iterations_completed="$1"
    local final_verdict="$2"
    local report_file="${REPORT_FILE:-loop-report.md}"
    local elapsed=$((SECONDS - ${LOOP_START_SECONDS:-0}))

    local tmp_report
    tmp_report=$(mktemp)

    cat > "$tmp_report" << EOF
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

        echo "### Iteration $iter_num" >> "$tmp_report"
        echo "" >> "$tmp_report"
        echo "- **Coder:** $turns turns, \$$cost" >> "$tmp_report"

        if [[ -f "$LOG_DIR/review-iter-$iter_num.txt" ]]; then
            if grep -qi "LGTM" "$LOG_DIR/review-iter-$iter_num.txt"; then
                echo "- **Review:** PASSED" >> "$tmp_report"
            else
                local issues
                issues=$(grep -c "\[CRITICAL\]\|\[HIGH\]\|\[MEDIUM\]\|\[LOW\]" \
                    "$LOG_DIR/review-iter-$iter_num.txt" 2>/dev/null || echo "0")
                echo "- **Review:** $issues issues found" >> "$tmp_report"
            fi
        fi
        echo "" >> "$tmp_report"
    done

    echo "## Files Changed" >> "$tmp_report"

    local first_commit
    first_commit=$(git rev-list --max-parents=0 HEAD 2>/dev/null | head -1)
    if [ -n "$first_commit" ]; then
        echo '```' >> "$tmp_report"
        git diff --stat "$first_commit"..HEAD 2>/dev/null >> "$tmp_report" || echo "Unable to compute diff" >> "$tmp_report"
        echo '```' >> "$tmp_report"
    fi

    # Include remaining findings if any
    if [[ -f "${REVIEW_FILE:-review-output.md}" ]]; then
        echo "" >> "$tmp_report"
        echo "## Remaining Findings" >> "$tmp_report"
        echo "" >> "$tmp_report"
        cat "${REVIEW_FILE:-review-output.md}" >> "$tmp_report"
    fi

    mv "$tmp_report" "$report_file"

    log "Report written to $report_file"
}
