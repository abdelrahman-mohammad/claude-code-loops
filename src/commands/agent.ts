import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readCclConfig, resolveAgentConfig } from "../utils/ccl-config.js";

export interface AgentListOptions {
  json?: boolean;
}

export interface AgentInfo {
  fileName: string;
  name: string;
  description: string;
  model: string;
  maxTurns: number | null;
  permissionMode: string;
  tools: string[];
  hasOverride: boolean;
  overrides: Record<string, string | number>;
}

/**
 * Parse full agent frontmatter including name, description, tools.
 * Extends beyond the managed fields (model, maxTurns, permissionMode).
 */
export function parseFullFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  const currentArray: string[] = [];

  for (const line of yaml.split("\n")) {
    if (currentArrayKey && /^\s+-\s+/.test(line)) {
      currentArray.push(line.replace(/^\s+-\s+/, "").trim());
      continue;
    }

    if (currentArrayKey) {
      result[currentArrayKey] = [...currentArray];
      currentArrayKey = null;
      currentArray.length = 0;
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)/);
    if (!kvMatch) continue;

    const [, key, rawValue] = kvMatch;
    const value = rawValue.trim();

    if (value === "" || value === "[]") {
      currentArrayKey = key;
      continue;
    }

    const unquoted = value.replace(/^["']|["']$/g, "");

    if (/^\d+$/.test(unquoted)) {
      result[key] = parseInt(unquoted, 10);
    } else {
      result[key] = unquoted;
    }
  }

  if (currentArrayKey) {
    result[currentArrayKey] = [...currentArray];
  }

  return result;
}

/** Build AgentInfo for a single agent file, applying ccl.json overrides. */
function buildAgentInfo(
  file: string,
  agentsDir: string,
  config: ReturnType<typeof readCclConfig>,
): AgentInfo {
  const content = fs.readFileSync(path.join(agentsDir, file), "utf-8");
  const fm = parseFullFrontmatter(content);
  const agentName = (fm.name as string) ?? path.basename(file, ".md");

  const overrides: Record<string, string | number> = {};
  let hasOverride = false;
  if (config?.agents.overrides[agentName]) {
    const o = config.agents.overrides[agentName];
    if (o.model) {
      overrides.model = o.model;
      hasOverride = true;
    }
    if (o.maxTurns) {
      overrides.maxTurns = o.maxTurns;
      hasOverride = true;
    }
    if (o.permissionMode) {
      overrides.permissionMode = o.permissionMode;
      hasOverride = true;
    }
  }

  const resolved = config ? resolveAgentConfig(config, agentName) : null;

  return {
    fileName: file,
    name: agentName,
    description: (fm.description as string) ?? "",
    model: resolved?.model ?? (fm.model as string) ?? "sonnet",
    maxTurns: resolved?.maxTurns ?? (fm.maxTurns as number) ?? null,
    permissionMode:
      resolved?.permissionMode ?? (fm.permissionMode as string) ?? "",
    tools: (fm.tools as string[]) ?? [],
    hasOverride,
    overrides,
  };
}

/** Collect all agents from .claude/agents/ directory. */
function collectAgents(destDir: string): AgentInfo[] | null {
  const agentsDir = path.join(destDir, ".claude", "agents");

  if (!fs.existsSync(agentsDir)) return null;

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return [];

  const config = readCclConfig(destDir);
  return files.map((file) => buildAgentInfo(file, agentsDir, config));
}

/** Format display lines for a single agent. */
function formatAgentLines(
  agent: AgentInfo,
  config: ReturnType<typeof readCclConfig>,
): string[] {
  const lines: string[] = [];

  let modelLine = `  Model:       ${agent.model}`;
  if (agent.overrides.model) {
    modelLine += pc.dim(
      ` (override, default=${config?.agents.defaults.model})`,
    );
  }
  lines.push(modelLine);

  if (agent.maxTurns !== null) {
    let turnsLine = `  Max turns:   ${agent.maxTurns}`;
    if (agent.overrides.maxTurns) {
      turnsLine += pc.dim(
        ` (override, default=${config?.agents.defaults.maxTurns})`,
      );
    }
    lines.push(turnsLine);
  }

  if (agent.permissionMode) {
    lines.push(`  Permission:  ${agent.permissionMode}`);
  }

  if (agent.tools.length > 0) {
    lines.push(`  Tools:       ${agent.tools.join(", ")}`);
  }

  if (agent.description) {
    lines.push(`  ${pc.dim(agent.description)}`);
  }

  return lines;
}

/** List all agents and their configuration. */
export async function agentListCommand(
  options: AgentListOptions,
): Promise<void> {
  const destDir = process.cwd();
  const agents = collectAgents(destDir);

  if (agents === null) {
    p.log.warn(
      "No .claude/agents/ directory found. Run " +
        pc.cyan("ccl init") +
        " first.",
    );
    return;
  }

  if (agents.length === 0) {
    p.log.warn("No agent files found in .claude/agents/");
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(agents, null, 2));
    return;
  }

  const config = readCclConfig(destDir);

  p.intro(pc.cyan("ccl agent list"));

  for (const agent of agents) {
    const lines = formatAgentLines(agent, config);
    p.note(lines.join("\n"), agent.name);
  }

  p.outro(`${agents.length} agent${agents.length === 1 ? "" : "s"} found`);
}
