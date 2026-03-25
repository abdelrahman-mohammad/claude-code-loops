#!/usr/bin/env node
// Stream filter for Claude Code stream-json output.
// Parses stream-json lines from stdin, prints tool activity to stderr,
// writes final result text to stdout.
//
// Usage: claude -p "..." --output-format stream-json --verbose | node stream-filter.js

import { runStreamFilter } from "../dist/utils/claude-stream.js";
runStreamFilter();
