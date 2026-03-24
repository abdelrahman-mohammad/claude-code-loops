import { Command } from "commander";
import { createRequire } from "node:module";
import { initCommand } from "./commands/init.js";
import { planCommand } from "./commands/plan.js";
import { runCommand } from "./commands/run.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("claude-code-loops")
  .description("Autonomous code-review-fix loops for Claude Code")
  .version(pkg.version);

program
  .command("init")
  .description("Scaffold Claude Code configuration for your project")
  .option(
    "-s, --stack <stack>",
    "Stack to use (node, spring-boot, fastapi, django, nextjs, generic)",
  )
  .option("--no-interactive", "Skip interactive prompts, use defaults")
  .action(async (options) => {
    await initCommand(options);
  });

program
  .command("plan")
  .description("Generate a structured task file from requirements")
  .argument("[input]", "Requirements file path (markdown, txt)")
  .option("-o, --output <file>", "Output task file path", "task.md")
  .option("--prompt <text>", "Inline requirement description")
  .option("--github-issue <number>", "GitHub issue number to import")
  .option("--stack <stack>", "Stack context for better decomposition")
  .action(async (input, options) => {
    await planCommand(input, options);
  });

program
  .command("run")
  .description("Run the code-review-fix loop on a task file")
  .argument("[task-file]", "Task file path")
  .option("--prompt <text>", "Inline task description (creates temp file)")
  .option("--iterations <n>", "Max iterations", parseInt)
  .option("--coder-agent <name>", "Coder agent name")
  .option("--reviewer-agent <name>", "Reviewer agent name")
  .option("--no-stop-on-pass", "Disable smart stop (tests pass + LGTM)")
  .option("--circuit-breaker <n>", "Same-error threshold before halt", parseInt)
  .option("--time-limit <duration>", "Wall-clock timeout (e.g. 30m, 2h)")
  .option("--token-budget <usd>", "Cost ceiling in USD", parseFloat)
  .option(
    "--coverage-threshold <pct>",
    "Coverage target percentage",
    parseFloat,
  )
  .option("--monitor", "Enable live tmux dashboard")
  .option("--no-commit", "Skip auto-commit after each phase")
  .action(async (taskFile, options) => {
    await runCommand(taskFile, options);
  });

program.parse();
