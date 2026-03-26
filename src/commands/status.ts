import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readCclConfig } from "../utils/ccl-config.js";
import { detectStack } from "../utils/detect-stack.js";
import { stackLabels } from "../installers/index.js";

export interface StatusOptions {
  json?: boolean;
}

interface StatusData {
  stack: { detected: string; label: string };
  config: ReturnType<typeof readCclConfig>;
  agents: string[];
  scripts: boolean;
  claudeMd: boolean;
  claudeDir: boolean;
}

/** Scan .claude/agents/ for agent markdown files. */
function scanAgents(destDir: string): string[] {
  const agentsDir = path.join(destDir, ".claude", "agents");
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.basename(f, ".md"));
}

/** Gather all status data for the current project. */
function collectStatus(destDir: string): StatusData {
  const stack = detectStack(destDir);
  const stackLabel = stackLabels[stack] ?? stack;
  const config = readCclConfig(destDir);
  const agents = scanAgents(destDir);
  const scripts = fs.existsSync(path.join(destDir, "scripts", "loop.sh"));
  const claudeMd = fs.existsSync(path.join(destDir, "CLAUDE.md"));
  const claudeDir = fs.existsSync(path.join(destDir, ".claude"));

  return {
    stack: { detected: stack, label: stackLabel },
    config,
    agents,
    scripts,
    claudeMd,
    claudeDir,
  };
}

/** Format config section lines for display. */
function formatConfigLines(status: StatusData): string[] {
  const lines: string[] = [];
  const { config } = status;

  if (!config) {
    lines.push(pc.dim("No ccl.json found -- using defaults"));
    return lines;
  }

  const d = config.agents.defaults;
  lines.push(`Model:         ${d.model}`);
  lines.push(`Max turns:     ${d.maxTurns}`);
  lines.push(`Permission:    ${d.permissionMode}`);

  const overrideNames = Object.keys(config.agents.overrides);
  if (overrideNames.length > 0) {
    lines.push("");
    lines.push("Agent overrides:");
    for (const name of overrideNames) {
      const o = config.agents.overrides[name];
      const parts: string[] = [];
      if (o.model !== undefined) parts.push(`model=${o.model}`);
      if (o.maxTurns !== undefined) parts.push(`maxTurns=${o.maxTurns}`);
      if (o.permissionMode !== undefined)
        parts.push(`permission=${o.permissionMode}`);
      lines.push(`  ${name}:`.padEnd(16) + parts.join(", "));
    }
  }

  lines.push("");
  lines.push("Loop defaults:");
  lines.push(`  iterations:      ${config.loop.iterations}`);
  lines.push(`  stopOnPass:      ${config.loop.stopOnPass}`);
  lines.push(`  buildGate:       ${config.loop.buildGate}`);
  lines.push(`  zeroDiffHalt:    ${config.loop.zeroDiffHalt}`);
  lines.push(`  circuitBreaker:  ${config.loop.circuitBreaker}`);
  lines.push(`  autoCommit:      ${!config.loop.noCommit}`);
  lines.push(`  monitor:         ${config.loop.monitor}`);
  if (config.loop.coverageThreshold !== null)
    lines.push(`  coverage:        ${config.loop.coverageThreshold}%`);
  if (config.loop.tokenBudget !== null)
    lines.push(`  tokenBudget:     $${config.loop.tokenBudget}`);
  if (config.loop.timeLimit !== null)
    lines.push(`  timeLimit:       ${config.loop.timeLimit}`);

  return lines;
}

/** Show a human-friendly view of the current project's ccl setup. */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const destDir = process.cwd();
  const status = collectStatus(destDir);

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  p.intro(pc.cyan("ccl status"));

  if (!status.claudeDir) {
    p.log.warn(
      "No .claude/ directory found. Run " + pc.cyan("ccl init") + " first.",
    );
    p.outro("");
    return;
  }

  const lines: string[] = [];

  lines.push(`Stack:         ${pc.cyan(status.stack.label)}`);
  lines.push("");
  lines.push(...formatConfigLines(status));
  lines.push("");
  lines.push(
    `Agents:        ${status.agents.length > 0 ? status.agents.join(", ") : pc.dim("none")}`,
  );
  lines.push(
    `Scripts:       ${status.scripts ? pc.green("installed") : pc.dim("not found")}`,
  );
  lines.push(
    `CLAUDE.md:     ${status.claudeMd ? pc.green("present") : pc.dim("not found")}`,
  );

  p.note(lines.join("\n"), "Project status");

  p.outro("");
}
