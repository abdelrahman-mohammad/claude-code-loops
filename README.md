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
│       ├── rate-limit.sh     # Rate limit detection & backoff
│       ├── git-commit.sh     # Auto-commit utilities
│       └── logging.sh        # Timestamped logging
├── CLAUDE.md                 # Project conventions for Claude
└── .claudeignore             # Files Claude should ignore
```

## Stacks

| Stack | Coder Agent | Reviewer Agent | Auto-format Hook | Extras |
|-------|-------------|----------------|------------------|--------|
| **Node.js/TypeScript** | Senior TS engineer (Sonnet) | Principal engineer reviewer (Sonnet) | Prettier | TypeScript rules |
| **Java/Spring Boot** | Spring Boot engineer (Opus) | Spring reviewer (Sonnet) | google-java-format | Java style + Spring DI rules, compile-check Stop hook |
| **Generic** | — | General code reviewer (Sonnet) | — | Minimal setup |

## Running the Loop

After scaffolding, create a task file and run:

```bash
# Create a task description
echo "Implement user authentication with JWT" > task.md

# Run 3 iterations of code → review → fix
bash scripts/loop.sh task.md --iterations 3
```

### Loop Options

```
bash scripts/loop.sh <task-file> [OPTIONS]

Options:
  --iterations N          Max iterations (default: 3)
  --coder-agent NAME      Agent for coding (default: coder)
  --reviewer-agent NAME   Agent for review (default: reviewer)
  --coder-turns N         Max turns for coder (default: 20)
  --reviewer-turns N      Max turns for reviewer (default: 8)
  --no-commit             Skip auto-commit after each phase
  --log-dir DIR           Log directory (default: .claude/logs)
  --permission-mode MODE  Permission mode (default: acceptEdits)
```

## Using Agents Directly

```bash
# Use the coder agent
claude --agent coder "Implement the user registration endpoint"

# Use the reviewer agent
claude --agent reviewer "Review all recent changes"

# Spring Boot (agents are named differently)
claude --agent spring-coder "Add the order management service"
claude --agent spring-reviewer "Review the changes"
```

## Merge Behavior

Running `init` on a project with an existing `.claude/` directory offers three options:

- **Merge** (default): Add new files, skip existing ones. `settings.json` and `CLAUDE.md` are always merged intelligently.
- **Overwrite**: Replace all files.
- **Backup**: Copy existing `.claude/` to `.claude.backup-<timestamp>/`, then overwrite.

Re-running `init` is safe — `CLAUDE.md` uses comment markers to replace only the generated section, preserving your edits.

## CLI Reference

```
claude-code-loops init [options]

Options:
  -s, --stack <stack>    Stack: node, spring-boot, generic
  --no-interactive       Skip prompts, use defaults
  -V, --version          Show version
  -h, --help             Show help
```

## How It Works

The loop follows a simple cycle:

1. **Coder agent** reads the task (or review findings from the previous iteration) and implements/fixes code
2. **Auto-commit** saves the changes
3. **Reviewer agent** examines the diff, runs tests, and produces a PASS/FAIL verdict
4. If FAIL: review findings are fed back to the coder for the next iteration
5. If PASS: loop exits

The coder and reviewer run in separate context windows — the reviewer literally cannot see the coder's reasoning, providing genuine independent review.

## License

MIT
