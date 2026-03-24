import { Command } from "commander";
import { createRequire } from "node:module";
import { initCommand } from "./commands/init.js";

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
  .option("-s, --stack <stack>", "Stack to use (node, spring-boot, generic)")
  .option("--no-interactive", "Skip interactive prompts, use defaults")
  .action(async (options) => {
    await initCommand(options);
  });

program.parse();
