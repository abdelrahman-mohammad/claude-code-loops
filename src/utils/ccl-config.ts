import fs from "node:fs";
import path from "node:path";

export const VALID_MODELS = ["sonnet", "opus", "haiku"] as const;
export type ModelName = (typeof VALID_MODELS)[number];

export interface AgentSettings {
  model?: ModelName;
  maxTurns?: number;
  permissionMode?: string;
}

export interface CclConfig {
  version: number;
  agents: {
    defaults: Required<AgentSettings>;
    overrides: Record<string, AgentSettings>;
  };
  loop: {
    iterations: number;
    stopOnPass: boolean;
    buildGate: boolean;
    zeroDiffHalt: boolean;
    circuitBreaker: number;
    noCommit: boolean;
    monitor: boolean;
    coverageThreshold: number | null;
    tokenBudget: number | null;
    timeLimit: string | null;
    coderBudget: number | null;
    reviewerBudget: number | null;
    phaseTimeout: string | null;
  };
}

export const DEFAULT_CONFIG: CclConfig = {
  version: 1,
  agents: {
    defaults: {
      model: "sonnet",
      maxTurns: 20,
      permissionMode: "acceptEdits",
    },
    overrides: {},
  },
  loop: {
    iterations: 10,
    stopOnPass: true,
    buildGate: true,
    zeroDiffHalt: true,
    circuitBreaker: 3,
    noCommit: false,
    monitor: false,
    coverageThreshold: null,
    tokenBudget: null,
    timeLimit: null,
    coderBudget: null,
    reviewerBudget: null,
    phaseTimeout: null,
  },
};

const CCL_CONFIG_PATH = ".claude/ccl/ccl.json";
const CCL_CONFIG_PATH_LEGACY = ".claude/ccl.json";

export function validateModel(model: string): model is ModelName {
  return (VALID_MODELS as readonly string[]).includes(model);
}

export function resolveAgentConfig(
  config: CclConfig,
  agentName: string,
): Required<AgentSettings> {
  const overrides = config.agents.overrides[agentName] ?? {};
  return { ...config.agents.defaults, ...overrides };
}

export function mergeCclConfig(
  existing: CclConfig,
  incoming: CclConfig,
): CclConfig {
  const mergedLoopEntries = Object.entries(incoming.loop).map(
    ([key, incomingVal]) => {
      const existingVal = existing.loop[key as keyof CclConfig["loop"]];
      if (existingVal !== undefined && existingVal !== null) {
        return [key, existingVal];
      }
      return [key, incomingVal];
    },
  );
  const mergedLoop = Object.fromEntries(mergedLoopEntries) as CclConfig["loop"];

  const mergedOverrides = { ...incoming.agents.overrides };
  for (const [agent, settings] of Object.entries(existing.agents.overrides)) {
    if (!(agent in mergedOverrides)) {
      mergedOverrides[agent] = settings;
    } else {
      mergedOverrides[agent] = { ...mergedOverrides[agent], ...settings };
    }
  }

  const mergedDefaults = { ...incoming.agents.defaults };
  for (const [key, val] of Object.entries(existing.agents.defaults)) {
    if (val !== undefined && val !== null) {
      (mergedDefaults as Record<string, unknown>)[key] = val;
    }
  }

  return {
    version: incoming.version,
    agents: { defaults: mergedDefaults, overrides: mergedOverrides },
    loop: mergedLoop,
  };
}

export function readCclConfig(destDir: string): CclConfig | null {
  const configPath = path.join(destDir, CCL_CONFIG_PATH);
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as CclConfig;
  }
  const legacyPath = path.join(destDir, CCL_CONFIG_PATH_LEGACY);
  if (fs.existsSync(legacyPath)) {
    return JSON.parse(fs.readFileSync(legacyPath, "utf-8")) as CclConfig;
  }
  return null;
}

export function writeCclConfig(destDir: string, config: CclConfig): void {
  const configPath = path.join(destDir, CCL_CONFIG_PATH);
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
