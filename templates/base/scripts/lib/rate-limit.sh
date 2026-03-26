#!/usr/bin/env bash
# rate-limit.sh — Rate limit detection and backoff

MAX_RETRIES="${MAX_RETRIES:-3}"
BACKOFF_TIMES=(30 60 120)

# Track temp files for cleanup
_RETRY_TMPFILES=()
trap '_retry_cleanup' EXIT

_retry_cleanup() {
  for f in "${_RETRY_TMPFILES[@]}"; do
    rm -f "$f" 2>/dev/null
  done
}

is_rate_limited() {
  local exit_code="$1"
  local stderr_file="$2"

  # Exit code 75 is a common rate limit indicator
  [[ $exit_code -eq 75 ]] && return 0

  # Check stderr for rate limit patterns (not stdout to avoid matching user code)
  if [ -f "$stderr_file" ]; then
    grep -qiE "rate.?limit|429|overloaded|too many requests" "$stderr_file" 2>/dev/null && return 0
  fi

  return 1
}

# Run a claude command with rate-limit retry logic.
# Usage: run_with_retry claude -p "prompt" --max-turns 20 ...
run_with_retry() {
  local retries=0
  local stdout_file stderr_file

  while [ $retries -lt "$MAX_RETRIES" ]; do
    stdout_file=$(mktemp)
    stderr_file=$(mktemp)
    _RETRY_TMPFILES+=("$stdout_file" "$stderr_file")

    if "$@" > "$stdout_file" 2>"$stderr_file"; then
      cat "$stdout_file"
      return 0
    fi

    local exit_code=$?

    if is_rate_limited "$exit_code" "$stderr_file"; then
      local backoff=${BACKOFF_TIMES[$retries]:-120}
      log "Rate limited. Waiting ${backoff}s before retry $((retries + 1))/$MAX_RETRIES..."
      sleep "$backoff"
    else
      local backoff=${BACKOFF_TIMES[$retries]:-120}
      log "Command failed (exit $exit_code). Waiting ${backoff}s before retry $((retries + 1))/$MAX_RETRIES..."
      sleep "$backoff"
    fi

    retries=$((retries + 1))
  done

  log_error "Command failed after $MAX_RETRIES retries"
  [ -f "$stderr_file" ] && cat "$stderr_file" >&2
  return 1
}
