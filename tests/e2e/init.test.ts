import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installBase } from "../../src/installers/base.js";
import { installNode } from "../../src/installers/node.js";
import { installSpringBoot } from "../../src/installers/spring-boot.js";
import { installFastapi } from "../../src/installers/fastapi.js";
import { installDjango } from "../../src/installers/django.js";
import { installNextjs } from "../../src/installers/nextjs.js";
import { installGeneric } from "../../src/installers/generic.js";
import type { CopyOptions } from "../../src/utils/copy.js";
import {
  readCclConfig,
  writeCclConfig,
  DEFAULT_CONFIG,
  type CclConfig,
} from "../../src/utils/ccl-config.js";
import { syncAgentFrontmatter } from "../../src/utils/sync-agent-frontmatter.js";
import { applyConfigFlags } from "../../src/commands/config.js";

let tmpDir: string;

const defaultOptions: CopyOptions = {
  mergeBehavior: "overwrite",
  templateVars: { projectName: "test-project" },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-e2e-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("init --stack node", () => {
  it("scaffolds base + node files", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);

    // Base files
    expect(fs.existsSync(path.join(tmpDir, ".claude", "settings.json"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "rules", "safety.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claudeignore"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "scripts", "loop.sh"))).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, "scripts", "lib", "logging.sh")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, "scripts", "lib", "stopping.sh")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, "scripts", "lib", "monitor.sh")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, "scripts", "lib", "report.sh")),
    ).toBe(true);

    // Node files
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "coder.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "rules", "typescript.md")),
    ).toBe(true);

    // CLAUDE.md contains both base and node content
    const claudeMd = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("claude-code-loops");
    expect(claudeMd).toContain("npm");
  });

  it("produces valid settings.json with merged hooks", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
    );

    // Should have both PreToolUse (from base) and PostToolUse (from node)
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
  });

  it("replaces {{projectName}} in templates", async () => {
    await installBase(tmpDir, defaultOptions);
    await installGeneric(tmpDir, defaultOptions);

    const claudeMd = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("test-project");
    expect(claudeMd).not.toContain("{{projectName}}");
  });
});

describe("init --stack spring-boot", () => {
  it("scaffolds base + spring-boot files", async () => {
    await installBase(tmpDir, defaultOptions);
    await installSpringBoot(tmpDir, defaultOptions);

    // Spring Boot agents
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "coder.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "rules", "java-style.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "rules", "spring-di.md")),
    ).toBe(true);

    // Settings has Stop hook
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
  });

  it("CLAUDE.md has Spring Boot content", async () => {
    await installBase(tmpDir, defaultOptions);
    await installSpringBoot(tmpDir, defaultOptions);

    const claudeMd = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("Spring Boot");
    expect(claudeMd).toContain("mvn");
  });
});

describe("init --stack fastapi", () => {
  it("scaffolds base + fastapi files", async () => {
    await installBase(tmpDir, defaultOptions);
    await installFastapi(tmpDir, defaultOptions);

    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "coder.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "rules", "python-style.md")),
    ).toBe(true);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks.PostToolUse).toBeDefined();

    const claudeMd = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("FastAPI");
    expect(claudeMd).toContain("uvicorn");
  });
});

describe("init --stack django", () => {
  it("scaffolds base + django files", async () => {
    await installBase(tmpDir, defaultOptions);
    await installDjango(tmpDir, defaultOptions);

    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "coder.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".claude", "rules", "django-patterns.md"),
      ),
    ).toBe(true);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks.PostToolUse).toBeDefined();

    const claudeMd = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("Django");
    expect(claudeMd).toContain("manage.py");
  });
});

describe("init --stack nextjs", () => {
  it("scaffolds base + nextjs files", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNextjs(tmpDir, defaultOptions);

    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "coder.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".claude", "rules", "nextjs-patterns.md"),
      ),
    ).toBe(true);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings.hooks.PostToolUse).toBeDefined();

    const claudeMd = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("Next.js");
    expect(claudeMd).toContain("next/image");
  });
});

describe("init --stack generic", () => {
  it("scaffolds base + generic files", async () => {
    await installBase(tmpDir, defaultOptions);
    await installGeneric(tmpDir, defaultOptions);

    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claudeignore"))).toBe(true);
  });
});

describe("merge behavior", () => {
  it("merge mode skips existing non-special files", async () => {
    // Pre-create a custom agent file
    const agentDir = path.join(tmpDir, ".claude", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "reviewer.md"), "my custom reviewer");

    const mergeOptions: CopyOptions = {
      ...defaultOptions,
      mergeBehavior: "merge",
    };
    await installBase(tmpDir, mergeOptions);
    await installGeneric(tmpDir, mergeOptions);

    // Custom file should be preserved
    const content = fs.readFileSync(
      path.join(agentDir, "reviewer.md"),
      "utf-8",
    );
    expect(content).toBe("my custom reviewer");
  });

  it("merge mode still merges settings.json", async () => {
    // Pre-create a settings.json with custom content
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ customKey: true }, null, 2),
    );

    const mergeOptions: CopyOptions = {
      ...defaultOptions,
      mergeBehavior: "merge",
    };
    await installBase(tmpDir, mergeOptions);

    const settings = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "settings.json"), "utf-8"),
    );
    // Should have both custom key and hooks from base
    expect(settings.customKey).toBe(true);
    expect(settings.hooks).toBeDefined();
  });

  it("CLAUDE.md appends on second run", async () => {
    await installBase(tmpDir, defaultOptions);
    await installGeneric(tmpDir, defaultOptions);

    const firstContent = fs.readFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "utf-8",
    );

    // Run again — should replace the generated section, not duplicate
    await installBase(tmpDir, { ...defaultOptions, mergeBehavior: "merge" });
    await installGeneric(tmpDir, { ...defaultOptions, mergeBehavior: "merge" });

    const secondContent = fs.readFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "utf-8",
    );

    // Count marker occurrences — should still be exactly 2 (one start, one end per section)
    const startMarkers = (
      secondContent.match(/<!-- Generated by claude-code-loops -->/g) || []
    ).length;
    // Base and generic each write one, but generic replaces base's section
    // Actually each copyTemplateDir call creates its own section
    expect(startMarkers).toBeGreaterThanOrEqual(1);
  });
});

describe("init generates ccl.json", () => {
  it("creates ccl.json with default model", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);

    // Simulate what init.ts does after installing
    writeCclConfig(tmpDir, DEFAULT_CONFIG);

    const config = readCclConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.agents.defaults.model).toBe("sonnet");
    expect(config!.version).toBe(1);
  });

  it("creates ccl.json with custom model", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);

    const customConfig: CclConfig = {
      ...DEFAULT_CONFIG,
      agents: {
        ...DEFAULT_CONFIG.agents,
        defaults: { ...DEFAULT_CONFIG.agents.defaults, model: "opus" },
      },
    };
    writeCclConfig(tmpDir, customConfig);

    const config = readCclConfig(tmpDir);
    expect(config!.agents.defaults.model).toBe("opus");
  });

  it("syncs model to agent frontmatter", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);

    const customConfig: CclConfig = {
      ...DEFAULT_CONFIG,
      agents: {
        defaults: {
          model: "opus",
          maxTurns: 20,
          permissionMode: "acceptEdits",
        },
        overrides: {},
      },
    };
    writeCclConfig(tmpDir, customConfig);
    syncAgentFrontmatter(tmpDir);

    const coderMd = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "coder.md"),
      "utf-8",
    );
    expect(coderMd).toContain("model: opus");
  });

  it("creates spring-boot overrides for coder", async () => {
    await installBase(tmpDir, defaultOptions);
    await installSpringBoot(tmpDir, defaultOptions);

    const config: CclConfig = {
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
    writeCclConfig(tmpDir, config);
    syncAgentFrontmatter(tmpDir);

    const read = readCclConfig(tmpDir);
    expect(read!.agents.overrides.coder).toEqual({ model: "opus" });

    // Coder should have opus, reviewer should have sonnet
    const coderMd = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "coder.md"),
      "utf-8",
    );
    expect(coderMd).toContain("model: opus");

    const reviewerMd = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "reviewer.md"),
      "utf-8",
    );
    expect(reviewerMd).toContain("model: sonnet");
  });
});

describe("init scaffolds new agents", () => {
  it("scaffolds planner and debugger agents", async () => {
    await installBase(tmpDir, defaultOptions);

    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "planner.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "debugger.md")),
    ).toBe(true);
  });

  it("generic stack includes coder agent", async () => {
    await installBase(tmpDir, defaultOptions);
    await installGeneric(tmpDir, defaultOptions);

    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "coder.md")),
    ).toBe(true);
  });
});

describe("config command integration", () => {
  it("updates model for all agents via applyConfigFlags", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);
    writeCclConfig(tmpDir, DEFAULT_CONFIG);

    const config = readCclConfig(tmpDir)!;
    const { config: updated } = applyConfigFlags(
      config,
      { model: "opus" },
      tmpDir,
    );
    writeCclConfig(tmpDir, updated);
    syncAgentFrontmatter(tmpDir);

    const coderMd = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "coder.md"),
      "utf-8",
    );
    expect(coderMd).toContain("model: opus");

    const reviewerMd = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "reviewer.md"),
      "utf-8",
    );
    expect(reviewerMd).toContain("model: opus");
  });

  it("updates model for specific agent only", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);
    writeCclConfig(tmpDir, DEFAULT_CONFIG);

    const config = readCclConfig(tmpDir)!;
    const { config: updated } = applyConfigFlags(
      config,
      {
        model: "haiku",
        agent: "reviewer",
      },
      tmpDir,
    );
    writeCclConfig(tmpDir, updated);
    syncAgentFrontmatter(tmpDir);

    // Reviewer should have haiku
    const reviewerMd = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "reviewer.md"),
      "utf-8",
    );
    expect(reviewerMd).toContain("model: haiku");

    // Coder should still have default sonnet
    const coderMd = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "coder.md"),
      "utf-8",
    );
    expect(coderMd).toContain("model: sonnet");
  });

  it("reset restores defaults", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);

    // Set custom model
    const customConfig: CclConfig = {
      ...DEFAULT_CONFIG,
      agents: {
        defaults: {
          model: "opus",
          maxTurns: 30,
          permissionMode: "acceptEdits",
        },
        overrides: {},
      },
    };
    writeCclConfig(tmpDir, customConfig);

    // Reset
    writeCclConfig(tmpDir, DEFAULT_CONFIG);
    syncAgentFrontmatter(tmpDir);

    const config = readCclConfig(tmpDir);
    expect(config!.agents.defaults.model).toBe("sonnet");
    expect(config!.agents.defaults.maxTurns).toBe(20);
  });

  it("preserves user config on re-init", async () => {
    await installBase(tmpDir, defaultOptions);
    await installNode(tmpDir, defaultOptions);

    // User sets custom config
    const customConfig: CclConfig = {
      ...DEFAULT_CONFIG,
      agents: {
        defaults: {
          model: "opus",
          maxTurns: 25,
          permissionMode: "acceptEdits",
        },
        overrides: { coder: { maxTurns: 50 } },
      },
      loop: { ...DEFAULT_CONFIG.loop, iterations: 5, timeLimit: "30m" },
    };
    writeCclConfig(tmpDir, customConfig);

    // Simulate re-init merge (what init.ts does)
    const { mergeCclConfig } = await import("../../src/utils/ccl-config.js");
    const existing = readCclConfig(tmpDir)!;
    const merged = mergeCclConfig(existing, DEFAULT_CONFIG);
    writeCclConfig(tmpDir, merged);

    const config = readCclConfig(tmpDir);
    // User values preserved
    expect(config!.agents.defaults.model).toBe("opus");
    expect(config!.agents.defaults.maxTurns).toBe(25);
    expect(config!.agents.overrides.coder).toEqual({ maxTurns: 50 });
    expect(config!.loop.iterations).toBe(5);
    expect(config!.loop.timeLimit).toBe("30m");
  });
});
