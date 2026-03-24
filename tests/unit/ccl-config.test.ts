import { resolve } from "node:path";
import {
  type CclConfig,
  DEFAULT_CONFIG,
  VALID_MODELS,
  validateModel,
  resolveAgentConfig,
  mergeCclConfig,
  readCclConfig,
  writeCclConfig,
} from "../../src/utils/ccl-config.js";

describe("ccl-config", () => {
  describe("validateModel", () => {
    it("accepts valid models", () => {
      expect(validateModel("sonnet")).toBe(true);
      expect(validateModel("opus")).toBe(true);
      expect(validateModel("haiku")).toBe(true);
    });

    it("rejects invalid models", () => {
      expect(validateModel("gpt-4")).toBe(false);
      expect(validateModel("")).toBe(false);
    });
  });

  describe("resolveAgentConfig", () => {
    it("returns defaults when no overrides", () => {
      const config: CclConfig = {
        ...DEFAULT_CONFIG,
        agents: {
          defaults: {
            model: "sonnet",
            maxTurns: 20,
            permissionMode: "acceptEdits",
          },
          overrides: {},
        },
      };
      const resolved = resolveAgentConfig(config, "reviewer");
      expect(resolved).toEqual({
        model: "sonnet",
        maxTurns: 20,
        permissionMode: "acceptEdits",
      });
    });

    it("merges overrides on top of defaults", () => {
      const config: CclConfig = {
        ...DEFAULT_CONFIG,
        agents: {
          defaults: {
            model: "sonnet",
            maxTurns: 20,
            permissionMode: "acceptEdits",
          },
          overrides: { coder: { model: "opus", maxTurns: 30 } },
        },
      };
      const resolved = resolveAgentConfig(config, "coder");
      expect(resolved).toEqual({
        model: "opus",
        maxTurns: 30,
        permissionMode: "acceptEdits",
      });
    });
  });

  describe("mergeCclConfig", () => {
    it("preserves existing scalar values", () => {
      const existing: CclConfig = {
        ...DEFAULT_CONFIG,
        agents: {
          defaults: {
            model: "opus",
            maxTurns: 25,
            permissionMode: "acceptEdits",
          },
          overrides: {},
        },
      };
      const incoming = DEFAULT_CONFIG;
      const merged = mergeCclConfig(existing, incoming);
      expect(merged.agents.defaults.model).toBe("opus");
      expect(merged.agents.defaults.maxTurns).toBe(25);
    });

    it("adds missing keys from incoming", () => {
      const existing = {
        version: 1,
        agents: {
          defaults: {
            model: "opus",
            maxTurns: 20,
            permissionMode: "acceptEdits",
          },
          overrides: {},
        },
        loop: {
          iterations: 5,
          stopOnPass: true,
          buildGate: true,
          zeroDiffHalt: true,
          circuitBreaker: 3,
          noCommit: false,
          monitor: false,
          coverageThreshold: null,
          tokenBudget: null,
          timeLimit: null,
        },
      } as CclConfig;
      const incoming = DEFAULT_CONFIG;
      const merged = mergeCclConfig(existing, incoming);
      expect(merged.loop.iterations).toBe(5);
      expect(merged.version).toBe(DEFAULT_CONFIG.version);
    });

    it("preserves existing agent overrides", () => {
      const existing: CclConfig = {
        ...DEFAULT_CONFIG,
        agents: {
          defaults: {
            model: "sonnet",
            maxTurns: 20,
            permissionMode: "acceptEdits",
          },
          overrides: { coder: { model: "opus" } },
        },
      };
      const incoming: CclConfig = {
        ...DEFAULT_CONFIG,
        agents: {
          defaults: {
            model: "sonnet",
            maxTurns: 20,
            permissionMode: "acceptEdits",
          },
          overrides: { reviewer: { maxTurns: 10 } },
        },
      };
      const merged = mergeCclConfig(existing, incoming);
      expect(merged.agents.overrides.coder).toEqual({ model: "opus" });
      expect(merged.agents.overrides.reviewer).toEqual({ maxTurns: 10 });
    });

    it("does not overwrite existing non-null with incoming null", () => {
      const existing: CclConfig = {
        ...DEFAULT_CONFIG,
        loop: { ...DEFAULT_CONFIG.loop, timeLimit: "30m" },
      };
      const incoming = DEFAULT_CONFIG;
      const merged = mergeCclConfig(existing, incoming);
      expect(merged.loop.timeLimit).toBe("30m");
    });
  });

  describe("readCclConfig / writeCclConfig", () => {
    it("round-trips config through filesystem", async () => {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-test-"));
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });

      writeCclConfig(tmpDir, DEFAULT_CONFIG);
      const read = readCclConfig(tmpDir);
      expect(read).toEqual(DEFAULT_CONFIG);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns null when no config exists", () => {
      const result = readCclConfig("/nonexistent/path");
      expect(result).toBeNull();
    });
  });
});
