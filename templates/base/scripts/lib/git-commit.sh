#!/usr/bin/env bash
# git-commit.sh — Smart auto-commit with optional message generation

# Auto-commit all changes with a given message prefix.
# Usage: auto_commit "iteration-1/code"
auto_commit() {
  local prefix="${1:-auto}"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A
    git commit -m "${prefix}: automated pass at $(date '+%H:%M:%S')" --no-verify
    log "Committed: ${prefix}"
    return 0
  else
    log "No changes to commit"
    return 1
  fi
}

# Generate a commit message using Claude (fast, cheap call).
# Usage: smart_commit
smart_commit() {
  local msg
  git add -A

  if git diff --cached --quiet; then
    log "No changes to commit"
    return 1
  fi

  msg=$(claude -p "Generate a one-line conventional commit message for: $(git diff --cached --stat)" \
    --output-format text --bare --max-turns 1 2>/dev/null) || msg="auto: changes at $(date '+%H:%M:%S')"

  git commit -m "$msg" --no-verify
  log "Committed: $msg"
}
