import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import {
  type CclConfig,
  type ModelName,
  DEFAULT_CONFIG,
  readCclConfig,
  writeCclConfig,
  validateModel,
} from "../utils/ccl-config.js";
import {
  syncAgentFrontmatter,
  bootstrapConfigFromAgents,
} from "../utils/sync-agent-frontmatter.js";

export interface ConfigOptions {
  model?: string;
  maxTurns?: string;
  permissionMode?: string;
  agent?: string;
  iterations?: string;
  stopOnPass?: string;
  buildGate?: string;
  zeroDiffHalt?: string;
  circuitBreaker?: string;
  commit?: string;
  monitor?: string;
  coverageThreshold?: string;
  tokenBudget?: string;
  timeLimit?: string;
  show?: boolean;
  reset?: boolean;
}

export function applyConfigFlags(
  config: CclConfig,
  options: ConfigOptions,
): { config: CclConfig; warnings: string[] } {
  const warnings: string[] = [];
  const updated = structuredClone(config);

  // Agent settings
  if (options.model || options.maxTurns || options.permissionMode) {
    if (options.model && !validateModel(options.model)) {
      throw new Error(
        `Invalid model: ${options.model}. Valid: sonnet, opus, haiku`,
      );
    }

    // Warn if --agent targets non-existent agent file
    if (options.agent) {
      const agentPath = path.join(
        process.cwd(),
        ".claude",
        "agents",
        `${options.agent}.md`,
      );
      if (!fs.existsSync(agentPath)) {
        warnings.push(
          `Agent file not found: ${options.agent}.md — override saved but won't apply until file exists`,
        );
      }
    }

    const target = options.agent
      ? (updated.agents.overrides[options.agent] ??= {})
      : updated.agents.defaults;

    if (options.model) target.model = options.model as ModelName;
    if (options.maxTurns) target.maxTurns = parseInt(options.maxTurns, 10);
    if (options.permissionMode) target.permissionMode = options.permissionMode;
  }

  // Loop settings
  if (options.iterations)
    updated.loop.iterations = parseInt(options.iterations, 10);
  if (options.stopOnPass)
    updated.loop.stopOnPass = options.stopOnPass === "true";
  if (options.buildGate) updated.loop.buildGate = options.buildGate === "true";
  if (options.zeroDiffHalt)
    updated.loop.zeroDiffHalt = options.zeroDiffHalt === "true";
  if (options.circuitBreaker)
    updated.loop.circuitBreaker = parseInt(options.circuitBreaker, 10);
  if (options.commit) updated.loop.noCommit = options.commit === "false";
  if (options.monitor) updated.loop.monitor = options.monitor === "true";
  if (options.coverageThreshold)
    updated.loop.coverageThreshold = parseFloat(options.coverageThreshold);
  if (options.tokenBudget)
    updated.loop.tokenBudget = parseFloat(options.tokenBudget);
  if (options.timeLimit) updated.loop.timeLimit = options.timeLimit;

  return { config: updated, warnings };
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  const destDir = process.cwd();

  // --show: print config as JSON
  if (options.show) {
    const config = readCclConfig(destDir);
    if (!config) {
      p.log.error("No ccl.json found. Run `ccl init` first.");
      process.exit(1);
    }
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // --reset
  if (options.reset) {
    if (options.agent) {
      const config = readCclConfig(destDir);
      if (config) {
        delete config.agents.overrides[options.agent];
        writeCclConfig(destDir, config);
        syncAgentFrontmatter(destDir);
        p.log.success(`Removed override for ${options.agent}`);
      }
    } else {
      writeCclConfig(destDir, DEFAULT_CONFIG);
      syncAgentFrontmatter(destDir);
      p.log.success("Reset all config to defaults");
    }
    return;
  }

  const hasFlags = !!(
    options.model ||
    options.maxTurns ||
    options.permissionMode ||
    options.iterations ||
    options.stopOnPass ||
    options.buildGate ||
    options.zeroDiffHalt ||
    options.circuitBreaker ||
    options.commit ||
    options.monitor ||
    options.coverageThreshold ||
    options.tokenBudget ||
    options.timeLimit
  );

  if (hasFlags) {
    // Non-interactive: apply flags
    const config = readCclConfig(destDir) ?? bootstrapConfigFromAgents(destDir);
    const { config: updated, warnings } = applyConfigFlags(config, options);
    writeCclConfig(destDir, updated);
    syncAgentFrontmatter(destDir);
    for (const w of warnings) p.log.warn(w);
    p.log.success("Configuration updated");
    return;
  }

  // Interactive mode placeholder (Task 6)
  await runInteractiveConfig();
}

async function runInteractiveConfig(): Promise<void> {
  p.log.info("Interactive config not yet implemented. Use flags instead.");
}
