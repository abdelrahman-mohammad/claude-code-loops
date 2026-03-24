# claude-code-loops

Autonomous code-review-fix loops for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Scaffolds Claude Code configurations (agents, hooks, rules, CLAUDE.md, orchestration scripts) for automated coder-reviewer loops across multiple tech stacks.

## Quick Start

```bash
npx claude-code-loops init
```

Or specify a stack directly:

```bash
npx claude-code-loops init --stack node
npx claude-code-loops init --stack spring-boot
npx claude-code-loops init --stack fastapi
npx claude-code-loops init --stack django
npx claude-code-loops init --stack nextjs
npx claude-code-loops init --stack generic
```

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

| Stack | Coder Agent | Reviewer Agent | Auto-format Hook | Extras |
|-------|-------------|----------------|------------------|--------|
| **Node.js/TypeScript** | Senior TS engineer (Sonnet) | Principal engineer reviewer (Sonnet) | Prettier | TypeScript rules |
| **Java/Spring Boot** | Spring Boot engineer (Opus) | Spring reviewer (Sonnet) | google-java-format | Java style + Spring DI rules, compile-check Stop hook |
| **Python/FastAPI** | Async Python engineer (Sonnet) | FastAPI reviewer (Sonnet) | ruff format + check | Pydantic v2 rules, async correctness |
| **Python/Django** | Django engineer (Sonnet) | Django reviewer (Sonnet) | ruff + djlint | ORM patterns, N+1 detection |
| **Next.js** | Full-stack Next.js engineer (Sonnet) | Next.js reviewer (Sonnet) | Prettier + ESLint | App Router rules, Server/Client boundaries |
| **Generic** | -- | General code reviewer (Sonnet) | -- | Minimal setup |

## Commands

### `init` -- Scaffold Configuration

```bash
claude-code-loops init [options]

Options:
  -s, --stack <stack>    Stack: node, spring-boot, fastapi, django, nextjs, generic
  --no-interactive       Skip prompts, use defaults
```

### `plan` -- Generate Task Files

Convert requirements into structured task files for the loop:

```bash
# From a requirements file
claude-code-loops plan requirements.md

# From a GitHub issue
claude-code-loops plan --input https://github.com/org/repo/issues/42

# From inline text
claude-code-loops plan --prompt "Add JWT authentication to the API"
```

### `run` -- Execute the Loop

First-class CLI wrapper around `loop.sh` with signal forwarding:

```bash
# Run with defaults (10 iterations, smart stopping)
claude-code-loops run task.md

# Customize iterations and agents
claude-code-loops run task.md --iterations 5 --coder-turns 30
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

Stopping conditions:
  --stop-on-pass          Exit on tests pass + LGTM review (default: ON)
  --stop-on-no-progress   Circuit breaker for stuck agents (default: ON)
  --build-gate            Skip reviewer on build failure (default: ON)
  --zero-diff-halt        Halt on no changes for 2 iterations (default: ON)
  --coverage-threshold N  Stop when coverage meets target (opt-in)
  --token-budget N        Cost ceiling across iterations (opt-in)
  --time-limit N          Wall-clock timeout in minutes (opt-in)

Monitoring:
  --monitor               Live tmux dashboard showing iteration progress
```

## Using Agents Directly

```bash
# Use the coder agent
claude --agent coder "Implement the user registration endpoint"

# Use the reviewer agent
claude --agent reviewer "Review all recent changes"
```

## Merge Behavior

Running `init` on a project with an existing `.claude/` directory offers three options:

- **Merge** (default): Add new files, skip existing ones. `settings.json` and `CLAUDE.md` are always merged intelligently.
- **Overwrite**: Replace all files.
- **Backup**: Copy existing `.claude/` to `.claude.backup-<timestamp>/`, then overwrite.

Re-running `init` is safe -- `CLAUDE.md` uses comment markers to replace only the generated section, preserving your edits.

## How It Works

The loop follows a simple cycle:

1. **Coder agent** reads the task (or review findings from the previous iteration) and implements/fixes code
2. **Auto-commit** saves the changes
3. **Build gate** checks compilation (skips reviewer on build failure)
4. **Reviewer agent** examines the diff, runs tests, and produces a PASS/FAIL verdict
5. **Stop conditions** evaluate: tests passing, progress stalled, budget exceeded, coverage met
6. If no stop condition triggers: review findings are fed back to the coder for the next iteration

The coder and reviewer run in separate context windows -- the reviewer literally cannot see the coder's reasoning, providing genuine independent review.

## License

MIT
