import fs from "node:fs";
import path from "node:path";
import {
  type CclConfig,
  type ModelName,
  DEFAULT_CONFIG,
  readCclConfig,
  resolveAgentConfig,
} from "./ccl-config.js";

interface ParsedFrontmatter {
  fields: Record<string, string>;
  body: string;
}

const MANAGED_FIELDS = ["model", "maxTurns", "permissionMode"] as const;

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: content };

  const rawFrontmatter = match[1];
  const body = match[2];
  const fields: Record<string, string> = {};

  for (const field of MANAGED_FIELDS) {
    const fieldMatch = rawFrontmatter.match(
      new RegExp(`^${field}:\\s*(.+)$`, "m"),
    );
    if (fieldMatch) {
      fields[field] = fieldMatch[1].trim();
    }
  }

  return { fields, body };
}

export function replaceFrontmatterField(
  content: string,
  field: string,
  value: string,
): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const fmMatch = normalized.match(/^(---\n[\s\S]*?\n---)([\s\S]*)$/);
  if (!fmMatch) return content;

  const frontmatter = fmMatch[1];
  const body = fmMatch[2];
  const regex = new RegExp(`^(${field}:)\\s*.+$`, "m");

  if (!regex.test(frontmatter)) return content;
  return frontmatter.replace(regex, `$1 ${value}`) + body;
}

export function buildSyncedContent(
  content: string,
  settings: Record<string, string | number>,
): string {
  let result = content;
  for (const [field, value] of Object.entries(settings)) {
    result = replaceFrontmatterField(result, field, String(value));
  }
  return result;
}

/**
 * Bootstrap a CclConfig from existing agent frontmatter when no ccl.json exists.
 */
export function bootstrapConfigFromAgents(destDir: string): CclConfig {
  const agentsDir = path.join(destDir, ".claude", "agents");
  if (!fs.existsSync(agentsDir)) return DEFAULT_CONFIG;

  const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  if (agentFiles.length === 0) return DEFAULT_CONFIG;

  const content = fs.readFileSync(path.join(agentsDir, agentFiles[0]), "utf-8");
  const { fields } = parseFrontmatter(content);

  return {
    ...DEFAULT_CONFIG,
    agents: {
      defaults: {
        model:
          (fields.model as ModelName) ?? DEFAULT_CONFIG.agents.defaults.model,
        maxTurns: fields.maxTurns
          ? parseInt(fields.maxTurns, 10)
          : DEFAULT_CONFIG.agents.defaults.maxTurns,
        permissionMode:
          fields.permissionMode ??
          DEFAULT_CONFIG.agents.defaults.permissionMode,
      },
      overrides: {},
    },
  };
}

export function syncAgentFrontmatter(destDir: string): void {
  const config = readCclConfig(destDir);
  if (!config) return;

  const agentsDir = path.join(destDir, ".claude", "agents");
  if (!fs.existsSync(agentsDir)) return;

  const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

  for (const file of agentFiles) {
    const agentName = file.replace(/\.md$/, "");
    const resolved = resolveAgentConfig(config, agentName);
    const filePath = path.join(agentsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const synced = buildSyncedContent(content, resolved);

    if (synced !== content) {
      fs.writeFileSync(filePath, synced, "utf-8");
    }
  }
}
