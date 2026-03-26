import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { TEMPLATES_DIR } from "../utils/copy.js";
import { readCclConfig } from "../utils/ccl-config.js";
import { syncAgentFrontmatter } from "../utils/sync-agent-frontmatter.js";

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
  commit?: boolean;
  dryRun?: boolean;
}

export async function runCommand(
  taskFile: string | undefined,
  options: RunOptions,
): Promise<void> {
  // Resolve loop script
  const projectScript = path.join(process.cwd(), "scripts", "loop.sh");
  const fallbackScript = path.join(TEMPLATES_DIR, "base", "scripts", "loop.sh");
  const loopScript = fs.existsSync(projectScript)
    ? projectScript
    : fallbackScript;

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

  // Read config and sync agent frontmatter
  const cclConfig = readCclConfig(process.cwd());
  syncAgentFrontmatter(process.cwd());

  // Build loop.sh args — CLI flags take priority over ccl.json defaults
  const args: string[] = [loopScript, resolvedTaskFile];

  const iterations = options.iterations ?? cclConfig?.loop.iterations;
  if (iterations) args.push("--iterations", String(iterations));

  if (options.coderAgent) args.push("--coder-agent", options.coderAgent);
  if (options.reviewerAgent)
    args.push("--reviewer-agent", options.reviewerAgent);

  const stopOnPass = options.stopOnPass ?? cclConfig?.loop.stopOnPass;
  if (stopOnPass === false) args.push("--no-stop-on-pass");

  const circuitBreaker =
    options.circuitBreaker ?? cclConfig?.loop.circuitBreaker;
  if (circuitBreaker)
    args.push("--no-progress-threshold", String(circuitBreaker));

  const timeLimit = options.timeLimit ?? cclConfig?.loop.timeLimit;
  if (timeLimit) args.push("--time-limit", timeLimit);

  const tokenBudget = options.tokenBudget ?? cclConfig?.loop.tokenBudget;
  if (tokenBudget) args.push("--token-budget", String(tokenBudget));

  const coverageThreshold =
    options.coverageThreshold ?? cclConfig?.loop.coverageThreshold;
  if (coverageThreshold)
    args.push("--coverage-threshold", String(coverageThreshold));

  const monitor = options.monitor ?? cclConfig?.loop.monitor;
  if (monitor) args.push("--monitor");

  // Commander's --no-commit sets options.commit = false
  const noCommit =
    options.commit === false ? true : (cclConfig?.loop.noCommit ?? false);
  if (noCommit) args.push("--no-commit");

  const buildGate = cclConfig?.loop.buildGate;
  if (buildGate) args.push("--build-gate");

  const zeroDiffHalt = cclConfig?.loop.zeroDiffHalt;
  if (zeroDiffHalt) args.push("--zero-diff-halt");

  if (options.dryRun) {
    const agentsDir = path.join(process.cwd(), ".claude", "agents");
    const coderName = options.coderAgent ?? "coder";
    const reviewerName = options.reviewerAgent ?? "reviewer";
    const coderFile = path.join(agentsDir, `${coderName}.md`);
    const reviewerFile = path.join(agentsDir, `${reviewerName}.md`);

    p.intro(pc.cyan("ccl run --dry-run"));

    p.note(
      [
        `Task file:       ${pc.cyan(path.basename(resolvedTaskFile))}`,
        `Loop script:     ${loopScript}`,
        `Iterations:      ${iterations ?? 10}`,
        `Coder agent:     ${coderName}`,
        `Reviewer agent:  ${reviewerName}`,
        `Stop on pass:    ${stopOnPass ?? true}`,
        `Circuit breaker: ${circuitBreaker ?? 3}`,
        `Time limit:      ${timeLimit ?? "-"}`,
        `Token budget:    ${tokenBudget ? "$" + tokenBudget : "-"}`,
        `Coverage:        ${coverageThreshold ? coverageThreshold + "%" : "-"}`,
        `Monitor:         ${monitor ?? false}`,
        `Auto-commit:     ${!noCommit}`,
        `Build gate:      ${buildGate ?? true}`,
        `Zero-diff halt:  ${zeroDiffHalt ?? true}`,
      ].join("\n"),
      "Resolved configuration",
    );

    p.note(
      [
        `Coder:    ${fs.existsSync(coderFile) ? pc.green("found") : pc.red("missing")}  ${coderFile}`,
        `Reviewer: ${fs.existsSync(reviewerFile) ? pc.green("found") : pc.red("missing")}  ${reviewerFile}`,
      ].join("\n"),
      "Agent files",
    );

    p.note(`bash ${args.join(" ")}`, "Command");

    if (isTempFile && resolvedTaskFile) {
      try {
        fs.unlinkSync(resolvedTaskFile);
      } catch {
        /* ignore */
      }
    }

    p.outro("Dry run complete — no loop was started");
    return;
  }

  p.log.info(`Running loop on ${pc.cyan(path.basename(resolvedTaskFile))}...`);

  // Resolve stream-filter script path for loop.sh to use
  // In dev: src/commands/run.ts → ../../bin/stream-filter.js
  // In built: dist/index.js → ../bin/stream-filter.js
  // Try both relative paths from the current file
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, "..", "bin", "stream-filter.js"),
    path.resolve(currentDir, "..", "..", "bin", "stream-filter.js"),
  ];
  const streamFilterPath = candidates.find((p) => fs.existsSync(p)) ?? "";

  const child = spawn("bash", args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(streamFilterPath ? { CCL_STREAM_FILTER: streamFilterPath } : {}),
    },
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
