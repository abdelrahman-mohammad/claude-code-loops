# Contributing to claude-code-loops

## Prerequisites

- Node.js >= 18
- npm

## Setup

```bash
git clone https://github.com/abdelrahman-mohammad/claude-code-loops.git
cd claude-code-loops
npm install
```

## Development Commands

```bash
npm run build          # Build with tsup
npm run lint           # Type check (tsc --noEmit)
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode

# Run without building
npx tsx src/index.ts init --stack node --no-interactive

# Test in a clean temp directory
TMPDIR=$(mktemp -d) && cd "$TMPDIR" && node "$(dirs +0)/dist/index.js" init --stack node --no-interactive
```

## Architecture

The project uses a **base + overlay** pattern. `templates/base/` is always copied first, then the selected stack overlay (`templates/node/`, `templates/fastapi/`, etc.) is layered on top.

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
   import { copyTemplateDir, TEMPLATES_DIR, type CopyOptions } from "../utils/copy.js";

   export async function installMyStack(destDir: string, options: CopyOptions): Promise<string[]> {
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
- **E2E tests** (`tests/e2e/`) scaffold into real temp directories and verify output structure
- Run a single test file: `npx vitest run tests/unit/merge-settings.test.ts`

## Submitting a PR

1. Fork the repo and create a feature branch
2. Make your changes
3. Ensure `npm run lint`, `npm test`, and `npm run build` all pass
4. Use [conventional commits](https://www.conventionalcommits.org/) (feat:, fix:, docs:, etc.)
5. Open a PR against `main` and fill out the template
