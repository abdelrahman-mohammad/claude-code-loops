# Contributing to claude-code-loops

## Prerequisites

- Node.js >= 18
- npm

## Setup

```bash
git clone https://github.com/abdelrahman-mohammad/claude-code-loops.git
cd claude-code-loops
npm install
npm run build
```

## Local Testing

Use `npm link` to test the CLI locally without publishing:

```bash
npm link                # creates global symlink to your local build
ccl -V                  # verify it points to your local version
```

Then from any project directory:

```bash
ccl init --stack node
ccl config --model opus
ccl plan --prompt "Add feature X"
```

After making changes, just rebuild — no need to re-link:

```bash
npm run build           # rebuild
ccl plan --prompt "..." # test immediately
```

## Development Commands

```bash
npm run build          # Build with tsup
npm run lint           # Type check (tsc --noEmit)
npm test               # Run all tests (unit + integration + e2e)
npm run test:watch     # Watch mode

# Run without building
npx tsx src/index.ts init --stack node --no-interactive

# Run a single test file
npx vitest run tests/unit/merge-settings.test.ts
```

## Project Structure

```
src/
  commands/        # CLI command handlers (init, plan, run, config)
  installers/      # Stack-specific installers
  prompts/         # Interactive prompts (@clack/prompts)
  utils/           # Shared utilities (copy, merge, config, stream)
templates/
  base/            # Shared across all stacks
  node/            # Node.js/TypeScript overlay
  spring-boot/     # Java/Spring Boot overlay
  fastapi/         # Python/FastAPI overlay
  django/          # Python/Django overlay
  nextjs/          # Next.js overlay
  generic/         # Minimal overlay
tests/
  unit/            # Pure utility function tests
  integration/     # CLI command tests (runs built dist/)
  e2e/             # Full scaffolding tests in temp directories
  fixtures/        # Sample project for integration tests
```

## Architecture

The project uses a **base + overlay** pattern. `templates/base/` is always copied first, then the selected stack overlay is layered on top.

Three files get special merge treatment instead of simple copy:

- `settings.json` -- deep-merged (hook arrays concatenated, permissions deduplicated)
- `CLAUDE.md` -- appended with idempotency markers
- `.claudeignore` -- lines appended with deduplication

See `.claude/CLAUDE.md` for full architecture details.

## Adding a New Stack

1. **Create the template directory** at `templates/<stack-name>/` with:
   - `.claude/agents/coder.md` and `.claude/agents/reviewer.md`
   - `.claude/rules/<style-guide>.md`
   - `.claude/settings.json` (PostToolUse hooks for auto-formatting)
   - `CLAUDE.md` (stack-specific project conventions)

2. **Create the installer** at `src/installers/<stack-name>.ts`:

   ```typescript
   import path from "node:path";
   import {
     copyTemplateDir,
     TEMPLATES_DIR,
     type CopyOptions,
   } from "../utils/copy.js";

   export async function installMyStack(
     destDir: string,
     options: CopyOptions,
   ): Promise<string[]> {
     const srcDir = path.join(TEMPLATES_DIR, "my-stack");
     return copyTemplateDir(srcDir, destDir, options);
   }
   ```

3. **Register it** in `src/installers/index.ts`:
   - Add to the `StackName` union type
   - Add to `installerMap`
   - Add to `stackLabels`

4. **Add auto-detection** (optional) in `src/utils/detect-stack.ts` if the stack has identifiable marker files.

5. **Add tests** in `tests/e2e/init.test.ts` following the existing pattern.

## Testing

- **Unit tests** (`tests/unit/`) test pure utility functions with no filesystem side effects
- **Integration tests** (`tests/integration/`) run CLI commands against a temp project fixture
- **E2E tests** (`tests/e2e/`) scaffold into real temp directories and verify output structure
- CI runs on Linux (Node 18, 20, 22) and Windows (Node 22)

## Submitting a PR

1. Create a feature branch (`feat/`, `fix/`, `chore/`, etc.)
2. Make your changes
3. Update `CHANGELOG.md` under the `[Unreleased]` section
4. Ensure `npm run lint`, `npm run build`, and `npm test` all pass
5. Use [conventional commits](https://www.conventionalcommits.org/) (feat:, fix:, docs:, etc.)
6. Open a PR against `main` and fill out the template
