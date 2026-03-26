import { Command } from "commander";
import { createRequire } from "node:module";
import { initCommand } from "./commands/init.js";
import { planCommand } from "./commands/plan.js";
import { runCommand } from "./commands/run.js";
import { configCommand } from "./commands/config.js";
import { statusCommand } from "./commands/status.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name(process.env.CCL_BIN_NAME ?? "claude-code-loops")
  .description("Autonomous code-review-fix loops for Claude Code")
  .version(pkg.version);

program
  .command("init")
  .description("Scaffold Claude Code configuration for your project")
  .option(
    "-s, --stack <stack>",
    "Stack to use (node, spring-boot, fastapi, django, nextjs, generic)",
  )
  .option("-m, --model <model>", "Model for agents (sonnet, opus, haiku)")
  .option("--no-interactive", "Skip interactive prompts, use defaults")
  .action(async (options) => {
    await initCommand(options);
  });

program
  .command("plan")
  .description("Generate a structured task file from requirements")
  .argument("[input]", "Requirements file path (markdown, txt)")
  .option("-o, --output <file>", "Output task file path")
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
  .option("--dry-run", "Show resolved config without running")
  .action(async (taskFile, options) => {
    await runCommand(taskFile, options);
  });

program
  .command("config")
  .description("View and modify loop configuration")
  .option("-m, --model <model>", "Model for agents (sonnet, opus, haiku)")
  .option("--max-turns <n>", "Max turns for agents")
  .option("--permission-mode <mode>", "Permission mode for agents")
  .option("--agent <name>", "Target specific agent for overrides")
  .option("--iterations <n>", "Max loop iterations")
  .option("--stop-on-pass <bool>", "Stop on tests pass + LGTM (true/false)")
  .option("--build-gate <bool>", "Skip reviewer on build failure (true/false)")
  .option("--zero-diff-halt <bool>", "Halt on no changes (true/false)")
  .option("--circuit-breaker <n>", "Same-error threshold before halt")
  .option("--commit <bool>", "Auto-commit after each phase (true/false)")
  .option("--monitor <bool>", "Enable tmux dashboard (true/false)")
  .option("--coverage-threshold <pct>", "Coverage target percentage")
  .option("--token-budget <usd>", "Cost ceiling in USD")
  .option("--time-limit <duration>", "Wall-clock timeout (e.g. 30m, 2h)")
  .option("--show", "Print current config as JSON")
  .option("--reset", "Reset config to defaults")
  .action(async (options) => {
    await configCommand(options);
  });

program
  .command("status")
  .description("Show current project configuration and setup status")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    await statusCommand(options);
  });

program.parse();
