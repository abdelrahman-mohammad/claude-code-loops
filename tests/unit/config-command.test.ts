import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  writeCclConfig,
  readCclConfig,
  DEFAULT_CONFIG,
} from "../../src/utils/ccl-config.js";
import { applyConfigFlags } from "../../src/commands/config.js";

describe("config command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-config-test-"));
    fs.mkdirSync(path.join(tmpDir, ".claude", "agents"), { recursive: true });
    writeCclConfig(tmpDir, DEFAULT_CONFIG);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("applyConfigFlags", () => {
    it("sets model in defaults", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const { config: updated } = applyConfigFlags(config, { model: "opus" });
      expect(updated.agents.defaults.model).toBe("opus");
    });

    it("sets model in agent override when --agent passed", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".claude", "agents", "coder.md"),
        "---\nname: coder\nmodel: sonnet\n---\nBody.",
      );
      const config = structuredClone(DEFAULT_CONFIG);
      const { config: updated } = applyConfigFlags(config, {
        model: "opus",
        agent: "coder",
      });
      expect(updated.agents.defaults.model).toBe("sonnet");
      expect(updated.agents.overrides.coder?.model).toBe("opus");
    });

    it("sets loop iterations", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const { config: updated } = applyConfigFlags(config, {
        iterations: "5",
      });
      expect(updated.loop.iterations).toBe(5);
    });

    it("sets boolean loop fields via string true/false", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const { config: updated } = applyConfigFlags(config, { commit: "false" });
      expect(updated.loop.noCommit).toBe(true);
    });

    it("throws on invalid model", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      expect(() => applyConfigFlags(config, { model: "gpt-4" })).toThrow(
        "Invalid model",
      );
    });

    it("warns on unknown agent", () => {
      const config = structuredClone(DEFAULT_CONFIG);
      const { warnings } = applyConfigFlags(config, {
        model: "opus",
        agent: "nonexistent",
      });
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain("nonexistent");
    });
  });
});
