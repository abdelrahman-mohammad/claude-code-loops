#!/usr/bin/env bash
# rate-limit.sh — Rate limit detection and backoff

POLL_INTERVAL="${POLL_INTERVAL:-300}"
MAX_RETRIES="${MAX_RETRIES:-3}"

# Run a claude command with rate-limit retry logic.
# Usage: run_with_retry claude -p "prompt" --max-turns 20 ...
run_with_retry() {
  local retries=0
  local output_file
  output_file=$(mktemp)

  while [ $retries -lt "$MAX_RETRIES" ]; do
    if "$@" > "$output_file" 2>&1; then
      cat "$output_file"
      rm -f "$output_file"
      return 0
    fi

    local exit_code=$?

    if [ $exit_code -eq 75 ] || grep -qi "rate" "$output_file" 2>/dev/null; then
      log "Rate limited. Waiting ${POLL_INTERVAL}s before retry $((retries + 1))/$MAX_RETRIES..."
      sleep "$POLL_INTERVAL"
    else
      log "Command failed (exit $exit_code). Waiting 30s before retry $((retries + 1))/$MAX_RETRIES..."
      sleep 30
    fi

    retries=$((retries + 1))
  done

  log_error "Command failed after $MAX_RETRIES retries"
  cat "$output_file" >&2
  rm -f "$output_file"
  return 1
}
