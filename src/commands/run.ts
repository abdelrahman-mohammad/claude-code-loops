import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { TEMPLATES_DIR } from "../utils/copy.js";

export interface RunOptions {
  iterations?: number;
  coderAgent?: string;
  reviewerAgent?: string;
  stopOnPass?: boolean;
  circuitBreaker?: number;
  timeLimit?: string;
  tokenBudget?: number;
  coverageThreshold?: number;
  monitor?: boolean;
  prompt?: string;
  noCommit?: boolean;
}

export async function runCommand(
  taskFile: string | undefined,
  options: RunOptions,
): Promise<void> {
  // Resolve loop script
  const projectScript = path.join(process.cwd(), "scripts", "loop.sh");
  const fallbackScript = path.join(TEMPLATES_DIR, "base", "scripts", "loop.sh");
  const loopScript = fs.existsSync(projectScript) ? projectScript : fallbackScript;

  if (!fs.existsSync(loopScript)) {
    p.log.error("No loop.sh found. Run `claude-code-loops init` first.");
    process.exit(1);
  }

  // If --prompt given, write temp task file
  let resolvedTaskFile = taskFile;
  let isTempFile = false;

  if (options.prompt && !taskFile) {
    const tempDir = path.join(process.cwd(), ".claude");
    fs.mkdirSync(tempDir, { recursive: true });
    resolvedTaskFile = path.join(tempDir, "task-temp.md");
    fs.writeFileSync(resolvedTaskFile, options.prompt, "utf-8");
    isTempFile = true;
  }

  if (!resolvedTaskFile || !fs.existsSync(resolvedTaskFile)) {
    p.log.error("Task file required. Provide a path or use --prompt.");
    process.exit(1);
  }

  // Build loop.sh args
  const args: string[] = [loopScript, resolvedTaskFile];

  if (options.iterations) args.push("--iterations", String(options.iterations));
  if (options.coderAgent) args.push("--coder-agent", options.coderAgent);
  if (options.reviewerAgent) args.push("--reviewer-agent", options.reviewerAgent);
  if (options.stopOnPass === false) args.push("--no-stop-on-pass");
  if (options.circuitBreaker) args.push("--no-progress-threshold", String(options.circuitBreaker));
  if (options.timeLimit) args.push("--time-limit", options.timeLimit);
  if (options.tokenBudget) args.push("--token-budget", String(options.tokenBudget));
  if (options.coverageThreshold) args.push("--coverage-threshold", String(options.coverageThreshold));
  if (options.monitor) args.push("--monitor");
  if (options.noCommit) args.push("--no-commit");

  p.log.info(`Running loop on ${pc.cyan(path.basename(resolvedTaskFile))}...`);

  const child = spawn("bash", args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env },
  });

  // Forward signals
  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("close", (code, signal) => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");

    // Clean up temp file
    if (isTempFile && resolvedTaskFile) {
      try {
        fs.unlinkSync(resolvedTaskFile);
      } catch {
        // ignore
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
    } else if (code === 0) {
      p.log.success("Loop completed successfully");
      process.exit(0);
    } else {
      p.log.error(`Loop exited with code ${code}`);
      process.exit(code ?? 1);
    }
  });
}
