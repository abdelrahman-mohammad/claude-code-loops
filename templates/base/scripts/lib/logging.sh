#!/usr/bin/env bash
# logging.sh — Timestamped logging utilities

LOG_DIR="${LOG_DIR:-.claude/logs}"
mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_DIR/loop.log"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_DIR/loop.log" >&2
}
