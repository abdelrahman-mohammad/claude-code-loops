# claude-code-loops

[![CI](https://github.com/abdelrahman-mohammad/claude-code-loops/actions/workflows/ci.yml/badge.svg)](https://github.com/abdelrahman-mohammad/claude-code-loops/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/claude-code-loops)](https://www.npmjs.com/package/claude-code-loops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Autonomous code-review-fix loops for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Scaffolds Claude Code configurations (agents, hooks, rules, CLAUDE.md, orchestration scripts) for automated coder-reviewer loops across multiple tech stacks.

## Quick Start

```bash
# 1. Scaffold into your project
cd your-project
npx ccl init          # or: npx claude-code-loops init

# 2. Write a task
echo "Add input validation to all API endpoints" > task.md

# 3. Run the loop (coder → commit → build gate → reviewer → repeat)
bash scripts/loop.sh task.md
```

That's it. The loop runs up to 10 iterations with smart stopping -- it exits early when tests pass and the reviewer gives LGTM.

### Pick a stack

```bash
npx ccl init --stack node         # Node.js / TypeScript
npx ccl init --stack spring-boot  # Java / Spring Boot
npx ccl init --stack fastapi      # Python / FastAPI
npx ccl init --stack django       # Python / Django
npx ccl init --stack nextjs       # Next.js
npx ccl init --stack generic      # Any project
```

Or just run `npx ccl init` -- it auto-detects your stack.

## What Gets Created

```
your-project/
├── .claude/
│   ├── agents/
│   │   ├── coder.md          # Coding agent with write access
│   │   └── reviewer.md       # Review agent (read-only)
│   ├── rules/
│   │   └── safety.md         # Protected file rules
│   └── settings.json         # Hooks for auto-formatting & safety
├── scripts/
│   ├── loop.sh               # Main orchestration loop
│   └── lib/
│       ├── logging.sh        # Timestamped logging
│       ├── git-commit.sh     # Auto-commit utilities
│       ├── rate-limit.sh     # Rate limit detection & backoff
│       ├── stopping.sh       # Smart stopping conditions
│       ├── monitor.sh        # Live tmux dashboard
│       └── report.sh         # Post-loop markdown reports
├── CLAUDE.md                 # Project conventions for Claude
└── .claudeignore             # Files Claude should ignore
```

## Stacks

| Stack | Coder Agent | Reviewer Agent | Auto-format | Extras |
|-------|-------------|----------------|-------------|--------|
| **Node.js/TypeScript** | Senior TS engineer | Principal engineer reviewer | Prettier | TypeScript strict rules |
| **Java/Spring Boot** | Spring Boot engineer | Spring reviewer | google-java-format | Spring DI rules, compile-check Stop hook |
| **Python/FastAPI** | Async Python engineer | FastAPI reviewer | ruff format + check | Pydantic v2 rules, async correctness |
| **Python/Django** | Django engineer | Django reviewer | ruff + djlint | ORM patterns, N+1 detection |
| **Next.js** | Full-stack Next.js engineer | Next.js reviewer | Prettier + ESLint | App Router rules, Server/Client boundaries |
| **Generic** | -- | General code reviewer | -- | Minimal setup for any project |

All agents run on Sonnet by default. The coder and reviewer run in **separate context windows** -- the reviewer cannot see the coder's reasoning, providing genuine independent review.

## Commands

### `init` -- Scaffold Configuration

```bash
ccl init [options]

Options:
  -s, --stack <stack>    Stack: node, spring-boot, fastapi, django, nextjs, generic
  --no-interactive       Skip prompts, use defaults
```

### `plan` -- Generate Task Files

Convert requirements into structured task files for the loop:

```bash
ccl plan requirements.md                                    # From a file
ccl plan --input https://github.com/org/repo/issues/42     # From a GitHub issue
ccl plan --prompt "Add JWT authentication to the API"       # From inline text
```

### `run` -- Execute the Loop

First-class CLI wrapper around `loop.sh` with signal forwarding:

```bash
ccl run task.md                              # Defaults: 10 iterations, smart stopping
ccl run task.md --iterations 5 --coder-turns 30   # Customize
```

### Running the Loop Directly

```bash
bash scripts/loop.sh <task-file> [OPTIONS]

Options:
  --iterations N          Max iterations (default: 10)
  --coder-agent NAME      Agent for coding (default: coder)
  --reviewer-agent NAME   Agent for review (default: reviewer)
  --coder-turns N         Max turns for coder (default: 20)
  --reviewer-turns N      Max turns for reviewer (default: 8)
  --no-commit             Skip auto-commit after each phase
  --log-dir DIR           Log directory (default: .claude/logs)
  --permission-mode MODE  Permission mode (default: acceptEdits)

Stopping conditions (all ON by default except opt-in):
  --stop-on-pass          Exit on tests pass + LGTM review
  --stop-on-no-progress   Circuit breaker for stuck agents
  --build-gate            Skip reviewer on build failure
  --zero-diff-halt        Halt on no changes for 2 iterations
  --coverage-threshold N  Stop when coverage meets target (opt-in)
  --token-budget N        Cost ceiling across iterations (opt-in)
  --time-limit N          Wall-clock timeout in minutes (opt-in)

Monitoring:
  --monitor               Live tmux dashboard showing iteration progress
```

## How It Works

```
┌─────────┐     ┌───────────┐     ┌────────────┐     ┌──────────┐
│  Task /  │────>│   Coder   │────>│ Auto-commit│────>│  Build   │
│ Findings │     │   Agent   │     │            │     │   Gate   │
└─────────┘     └───────────┘     └────────────┘     └────┬─────┘
     ^                                                     │
     │                                              Pass? ─┤── No: back to Coder
     │                                                     │
     │                                                    Yes
     │                                                     │
     │           ┌───────────┐     ┌────────────┐          v
     └───────────│ Stop      │<────│  Reviewer  │<─────────┘
      (if FAIL)  │ Conditions│     │   Agent    │
                 └─────┬─────┘     └────────────┘
                       │
                 Met? ─┤── Yes: exit with report
                       │── No: next iteration
```

1. **Coder agent** reads the task (or review findings) and implements/fixes code
2. **Auto-commit** saves the changes
3. **Build gate** checks compilation -- skips reviewer on build failure
4. **Reviewer agent** examines the diff, runs tests, produces PASS/FAIL verdict
5. **Stop conditions** evaluate: tests passing, progress stalled, budget exceeded, coverage met
6. If no stop condition triggers: findings feed back to coder for next iteration

## Using Agents Directly

The scaffolded agents work standalone too:

```bash
claude --agent coder "Implement the user registration endpoint"
claude --agent reviewer "Review all recent changes"
```

## Merge Behavior

Running `init` on a project with an existing `.claude/` directory offers three options:

- **Merge** (default): Add new files, skip existing ones. `settings.json` and `CLAUDE.md` are always merged intelligently.
- **Overwrite**: Replace all files.
- **Backup**: Copy existing `.claude/` to `.claude.backup-<timestamp>/`, then overwrite.

Re-running `init` is safe -- `CLAUDE.md` uses comment markers to replace only the generated section, preserving your edits.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, development commands, and how to add a new stack.

## License

[MIT](LICENSE)
