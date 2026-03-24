# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-24

### Added

- `plan` command — generate structured task files from requirements, GitHub issues, or inline prompts
- `run` command — first-class CLI wrapper around loop.sh with signal forwarding
- `--monitor` flag for loop.sh — live tmux dashboard showing iteration progress
- Post-loop reporting — generates `loop-report.md` with cost, iteration, and diff summaries
- Project `.claude/` dev configuration:
  - Rules: no-attribution, code-style, template-integrity (path-scoped)
  - Skills: template-guide (agent/hook/rule authoring reference), bash-dev (portability, ShellCheck, bats-core)
  - Hooks: auto-format (Prettier PostToolUse), type-check (tsc Stop hook), auto-test (vitest PostToolUse)
  - PreToolUse guards: protected file blocking, push-to-main blocking
  - SessionStart hook: git branch context injection
  - Checkpoint commit Stop hook safety net
  - Git workflow instructions in CLAUDE.md (incremental conventional commits)

## [0.1.1] - 2026-03-24

### Added

- Python/FastAPI stack — async correctness agents, ruff auto-format hooks, Pydantic v2 rules
- Python/Django stack — N+1 query detection agents, ruff + djlint hooks, ORM pattern rules
- Next.js stack — Server/Client boundary agents, prettier + eslint hooks, App Router rules
- Smart stopping conditions in loop.sh:
  - `--stop-on-pass` — exit when tests pass + review LGTM (default: ON)
  - `--stop-on-no-progress` — circuit breaker for stuck agents (default: ON)
  - `--build-gate` — skip reviewer on build failure (default: ON)
  - `--zero-diff-halt` — halt on no changes with 1 retry (default: ON)
  - `--coverage-threshold` — stop when coverage meets target (opt-in)
  - `--token-budget` — cost ceiling across iterations (opt-in)
  - `--time-limit` — wall-clock timeout (opt-in)
- `stopping.sh` helper library with composable stop condition functions
- Stack auto-detection for FastAPI (pyproject.toml/requirements.txt), Django (manage.py), Next.js (next.config.\*)

### Changed

- Default `--iterations` increased from 3 to 10 (smart stopping is now the primary exit)
- Stack detection priority: Next.js > Node > Django > FastAPI > Spring Boot > generic

## [0.1.0] - 2026-03-24

### Added

- `init` command with interactive @clack/prompts flow
- Node.js/TypeScript stack — coder + reviewer agents, Prettier hooks, TypeScript rules
- Java/Spring Boot stack — spring-coder (Opus) + spring-reviewer agents, google-java-format hooks, compile-check Stop hook
- Generic stack — minimal reviewer agent with general checklist
- Base templates shared across all stacks:
  - Safety rules (protected file blocking)
  - Orchestration loop script (`scripts/loop.sh`)
  - Helper libraries (rate-limit, git-commit, logging)
  - `.claudeignore` with common ignores
- Merge-safe installation: settings.json deep-merged, CLAUDE.md appended with markers, .claudeignore deduplicated
- Three merge modes: merge (skip existing), overwrite, backup
- `{{projectName}}` template variable replacement
- Auto-detection of Node.js and Spring Boot from marker files
- `--stack` flag for non-interactive mode
- 35 tests (25 unit + 10 E2E)
