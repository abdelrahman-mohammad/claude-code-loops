# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-03-26

### Added

- Per-phase budget limits (`--coder-budget`, `--reviewer-budget`) to cap cost per claude call
- Per-phase timeout (`--phase-timeout`) to prevent hanging phases
- Per-run timestamped log directories under `.claude/ccl/logs/`
- Signal handling with partial report generation on interruption
- `ccl history` now shows multiple past runs, not just the latest

### Fixed

- Piped exit codes no longer mask claude failures (two-step execution)
- Cost tracking now includes both coder and reviewer phases
- Zero-diff detection uses diff hashes to catch oscillating changes
- Build errors preserved across iterations for better coder context
- Auto-commit errors logged instead of silently swallowed
- Rate-limit retry uses exponential backoff (30s, 60s, 120s)
- Report generation uses atomic writes to prevent corruption
- Temp files cleaned up on all exit paths

### Changed

- Config file moved from `.claude/ccl.json` to `.claude/ccl/ccl.json` (backward compatible)
- Raw claude output saved to `.raw.json` files for debugging

## [0.7.0] - 2026-03-26

### Added

- `ccl status` command — human-friendly view of project configuration
- `ccl doctor` command — diagnostic checks for setup verification
- `ccl upgrade` command — update scaffolded files to latest templates
- `ccl agent list` command — list agents with configuration and overrides
- `ccl history` command — show latest loop run data and iteration breakdown
- `ccl run --dry-run` flag — preview resolved loop config without starting
- Unit tests for new commands (37 new tests, 130 total)

### Changed

- Improved coder agent prompts with self-review checklists and escalation protocols
- Improved reviewer agent prompts with three-tier verdicts (PASS/PASS_WITH_SUGGESTIONS/FAIL) and structured issue categorization
- Improved planner agent with file structure mapping and bite-sized task methodology
- Improved debugger agent with systematic root-cause investigation phases

## [0.6.3] - 2026-03-26

### Fixed

- Planner outputs text directly; Node.js writes the plan file (fixes Write tool permission issue in print mode)
- Plan filenames use Claude-generated title slug: `{date}-{4-word-slug}.md` in `.claude/plans/ccl/`

### Added

- Integration tests for init, config, plan, and run commands
- Windows CI job (`windows-latest`, Node 22)
- Dependabot config for npm and GitHub Actions updates
- Improved bug report template with version, OS, and command fields

### Changed

- CI and release workflows build before test (integration tests need `dist/`)

## [0.6.0] - 2026-03-25

### Added

- Real-time streaming output for `ccl plan` and `ccl run` using `--output-format stream-json`
- Shared `claude-stream` utility for parsing stream-json events
- `CCL_STREAM_FILTER` env var for loop.sh to enable streaming during coder/reviewer phases
- Stream filter bin script (`bin/stream-filter.js`) for piping claude output

### Changed

- Plan command no longer shows redundant text preview — just task count
- Falls back gracefully to non-streaming when filter is unavailable

## [0.5.0] - 2026-03-24

### Added

- `ccl config` command for viewing and modifying persistent configuration
- `--model` flag on `ccl init` for setting agent model during scaffolding
- `.claude/ccl.json` config file as single source of truth for agent and loop settings
- Per-agent overrides in config (e.g., coder uses opus, reviewer uses sonnet)
- Agent frontmatter sync from config on init, config change, and run
- Interactive config menu with current settings dashboard
- `--show` flag to print config as JSON
- `--reset` flag to restore defaults

### Changed

- `ccl run` reads loop defaults from `ccl.json`, CLI flags override
- Removed `includeScripts` prompt — scripts are always included

## [0.4.0] - 2026-03-24

### Added

- Planner agent (`templates/base/.claude/agents/planner.md`) with superpowers-inspired methodology
- Debugger agent (`templates/base/.claude/agents/debugger.md`) for systematic root-cause investigation
- Coder agent improvements: self-review checklist, escalation protocol, explore-first workflow
- Reviewer agent improvements: three-tier verdicts (PASS, PASS_WITH_SUGGESTIONS, FAIL), issue categorization (Critical/Important/Suggestion), plan alignment check
- Generic stack now includes a coder agent
- `ccl plan` uses planner agent with fallback to bundled prompt

### Changed

- Replaced `templates/base/prompts/plan-system-prompt.md` with planner agent

### Removed

- `templates/base/prompts/` directory

## [0.3.0] - 2026-03-24

### Added

- `ccl` shorthand binary (`npx ccl init` instead of `npx claude-code-loops init`)
- README diagram improvements

## [0.2.0] - 2026-03-24

### Added

- `plan` command — generate structured task files from requirements, GitHub issues, or inline prompts
- `run` command — first-class CLI wrapper around loop.sh with signal forwarding
- `--monitor` flag for loop.sh — live tmux dashboard showing iteration progress
- Post-loop reporting — generates `loop-report.md` with cost, iteration, and diff summaries

## [0.1.1] - 2026-03-24

### Added

- Python/FastAPI stack — async correctness agents, ruff auto-format hooks, Pydantic v2 rules
- Python/Django stack — N+1 query detection agents, ruff + djlint hooks, ORM pattern rules
- Next.js stack — Server/Client boundary agents, prettier + eslint hooks, App Router rules
- Smart stopping conditions in loop.sh
- Stack auto-detection for FastAPI, Django, Next.js

### Changed

- Default `--iterations` increased from 3 to 10 (smart stopping is now the primary exit)

## [0.1.0] - 2026-03-24

### Added

- `init` command with interactive @clack/prompts flow
- Node.js/TypeScript stack — coder + reviewer agents, Prettier hooks, TypeScript rules
- Java/Spring Boot stack — spring-coder (Opus) + spring-reviewer agents, google-java-format hooks
- Generic stack — minimal reviewer agent with general checklist
- Base templates: safety rules, loop.sh, helper libraries, .claudeignore
- Merge-safe installation: settings.json deep-merged, CLAUDE.md appended, .claudeignore deduplicated
- Three merge modes: merge, overwrite, backup
- Auto-detection of Node.js and Spring Boot
- 35 tests (25 unit + 10 E2E)
