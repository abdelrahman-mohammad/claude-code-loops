import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  type CclConfig,
  type ModelName,
  type AgentSettings,
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

  // Interactive mode
  await runInteractiveConfig(destDir);
}

async function runInteractiveConfig(destDir: string): Promise<void> {
  const config = readCclConfig(destDir) ?? bootstrapConfigFromAgents(destDir);

  p.intro(pc.cyan("ccl config") + " — configuration");

  // Display current settings
  const overrideLines = Object.entries(config.agents.overrides).map(
    ([name, s]) =>
      `  ${name}: ${Object.entries(s)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
  );

  p.note(
    [
      `${pc.bold("Agents (defaults):")}`,
      `  model:          ${config.agents.defaults.model}`,
      `  maxTurns:       ${config.agents.defaults.maxTurns}`,
      `  permissionMode: ${config.agents.defaults.permissionMode}`,
      "",
      ...(overrideLines.length > 0
        ? [`${pc.bold("Agent overrides:")}`, ...overrideLines, ""]
        : []),
      `${pc.bold("Loop:")}`,
      `  iterations:        ${config.loop.iterations}`,
      `  stopOnPass:        ${config.loop.stopOnPass}`,
      `  buildGate:         ${config.loop.buildGate}`,
      `  zeroDiffHalt:      ${config.loop.zeroDiffHalt}`,
      `  circuitBreaker:    ${config.loop.circuitBreaker}`,
      `  noCommit:          ${config.loop.noCommit}`,
      `  monitor:           ${config.loop.monitor}`,
      `  coverageThreshold: ${config.loop.coverageThreshold ?? "-"}`,
      `  tokenBudget:       ${config.loop.tokenBudget ?? "-"}`,
      `  timeLimit:         ${config.loop.timeLimit ?? "-"}`,
    ].join("\n"),
    "Current configuration",
  );

  const section = await p.select({
    message: "What would you like to change?",
    options: [
      { label: "Agent defaults", value: "agent-defaults" as const },
      { label: "Agent override (per-agent)", value: "agent-override" as const },
      { label: "Loop settings", value: "loop" as const },
      { label: "Reset to defaults", value: "reset" as const },
    ],
  });

  if (p.isCancel(section)) {
    p.cancel("Cancelled.");
    return;
  }

  if (section === "reset") {
    writeCclConfig(destDir, DEFAULT_CONFIG);
    syncAgentFrontmatter(destDir);
    p.log.success("Reset all config to defaults");
    p.outro("Done");
    return;
  }

  if (section === "agent-defaults") {
    const model = await p.select({
      message: "Model:",
      options: [
        { label: "Sonnet", value: "sonnet" as const },
        { label: "Opus", value: "opus" as const },
        { label: "Haiku", value: "haiku" as const },
      ],
      initialValue: config.agents.defaults.model,
    });
    if (p.isCancel(model)) {
      p.cancel("Cancelled.");
      return;
    }

    const maxTurns = await p.text({
      message: "Max turns:",
      initialValue: String(config.agents.defaults.maxTurns),
      validate: (v) =>
        isNaN(parseInt(v, 10)) ? "Must be a number" : undefined,
    });
    if (p.isCancel(maxTurns)) {
      p.cancel("Cancelled.");
      return;
    }

    const permissionMode = await p.text({
      message: "Permission mode:",
      initialValue: config.agents.defaults.permissionMode,
    });
    if (p.isCancel(permissionMode)) {
      p.cancel("Cancelled.");
      return;
    }

    config.agents.defaults.model = model;
    config.agents.defaults.maxTurns = parseInt(maxTurns, 10);
    config.agents.defaults.permissionMode = permissionMode;
  }

  if (section === "agent-override") {
    const agentsDir = path.join(destDir, ".claude", "agents");
    const agentFiles = fs.existsSync(agentsDir)
      ? fs
          .readdirSync(agentsDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.replace(/\.md$/, ""))
      : [];

    if (agentFiles.length === 0) {
      p.log.warn("No agent files found in .claude/agents/");
      p.outro("Done");
      return;
    }

    const agentName = await p.select({
      message: "Which agent?",
      options: agentFiles.map((name) => ({
        label:
          name +
          (config.agents.overrides[name] ? pc.dim(" (has override)") : ""),
        value: name,
      })),
    });
    if (p.isCancel(agentName)) {
      p.cancel("Cancelled.");
      return;
    }

    const existing = config.agents.overrides[agentName] ?? {};

    const model = await p.select({
      message: `Model for ${agentName}:`,
      options: [
        { label: "Sonnet", value: "sonnet" as const },
        { label: "Opus", value: "opus" as const },
        { label: "Haiku", value: "haiku" as const },
        {
          label: `Use default (${config.agents.defaults.model})`,
          value: "__default__" as const,
        },
      ],
      initialValue: existing.model ?? "__default__",
    });
    if (p.isCancel(model)) {
      p.cancel("Cancelled.");
      return;
    }

    const maxTurns = await p.text({
      message: `Max turns for ${agentName} (blank = use default):`,
      initialValue: existing.maxTurns ? String(existing.maxTurns) : "",
      validate: (v) =>
        v && isNaN(parseInt(v, 10)) ? "Must be a number" : undefined,
    });
    if (p.isCancel(maxTurns)) {
      p.cancel("Cancelled.");
      return;
    }

    const override: AgentSettings = {};
    if (model !== "__default__" && validateModel(model)) override.model = model;
    if (maxTurns) override.maxTurns = parseInt(maxTurns, 10);

    if (Object.keys(override).length > 0) {
      config.agents.overrides[agentName] = override;
    } else {
      delete config.agents.overrides[agentName];
    }
  }

  if (section === "loop") {
    const iterations = await p.text({
      message: "Max iterations:",
      initialValue: String(config.loop.iterations),
      validate: (v) =>
        isNaN(parseInt(v, 10)) ? "Must be a number" : undefined,
    });
    if (p.isCancel(iterations)) {
      p.cancel("Cancelled.");
      return;
    }

    const stopOnPass = await p.confirm({
      message: "Stop on pass (tests pass + LGTM)?",
      initialValue: config.loop.stopOnPass,
    });
    if (p.isCancel(stopOnPass)) {
      p.cancel("Cancelled.");
      return;
    }

    const buildGate = await p.confirm({
      message: "Build gate (skip reviewer on build failure)?",
      initialValue: config.loop.buildGate,
    });
    if (p.isCancel(buildGate)) {
      p.cancel("Cancelled.");
      return;
    }

    const noCommit = await p.confirm({
      message: "Disable auto-commit?",
      initialValue: config.loop.noCommit,
    });
    if (p.isCancel(noCommit)) {
      p.cancel("Cancelled.");
      return;
    }

    const timeLimit = await p.text({
      message: "Time limit (e.g. 30m, 2h, or blank for none):",
      initialValue: config.loop.timeLimit ?? "",
    });
    if (p.isCancel(timeLimit)) {
      p.cancel("Cancelled.");
      return;
    }

    config.loop.iterations = parseInt(iterations, 10);
    config.loop.stopOnPass = stopOnPass;
    config.loop.buildGate = buildGate;
    config.loop.noCommit = noCommit;
    config.loop.timeLimit = timeLimit || null;
  }

  writeCclConfig(destDir, config);
  syncAgentFrontmatter(destDir);
  p.outro(pc.green("Configuration updated"));
}
