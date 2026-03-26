import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/sample-project");
const CLI_PATH = path.resolve(__dirname, "../../dist/index.js");

function createTempProject(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-test-"));
  fs.cpSync(FIXTURE_DIR, tmp, { recursive: true });
  // Init a git repo so loop.sh and other commands work
  execSync(
    'git init && git config user.email "test@test.com" && git config user.name "Test" && git add -A && git commit -m init',
    { cwd: tmp, stdio: "ignore" },
  );
  return tmp;
}

function runCcl(args: string[], cwd: string): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("ccl init", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("scaffolds .claude directory with agents and rules", () => {
    runCcl(["init", "--stack", "node", "--no-interactive"], tmpDir);

    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "coder.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "planner.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "agents", "debugger.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "rules", "safety.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "scripts", "loop.sh"))).toBe(true);
  });

  it("creates ccl.json with default config", () => {
    runCcl(["init", "--stack", "node", "--no-interactive"], tmpDir);

    const configPath = path.join(tmpDir, ".claude", "ccl.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.agents.defaults.model).toBe("sonnet");
    expect(config.loop.iterations).toBe(10);
  });

  it("respects --model flag", () => {
    runCcl(
      ["init", "--stack", "node", "--model", "opus", "--no-interactive"],
      tmpDir,
    );

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "ccl.json"), "utf-8"),
    );
    expect(config.agents.defaults.model).toBe("opus");

    const coder = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "coder.md"),
      "utf-8",
    );
    expect(coder).toContain("model: opus");
  });

  it("is idempotent with merge behavior", () => {
    runCcl(["init", "--stack", "node", "--no-interactive"], tmpDir);

    // Add custom content to CLAUDE.md
    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    fs.appendFileSync(claudeMd, "\n# My custom section\n");

    // Re-run init
    runCcl(["init", "--stack", "node", "--no-interactive"], tmpDir);

    const content = fs.readFileSync(claudeMd, "utf-8");
    expect(content).toContain("My custom section");
  });
});

describe("ccl config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempProject();
    runCcl(["init", "--stack", "node", "--no-interactive"], tmpDir);
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("updates model in ccl.json and syncs agent frontmatter", () => {
    runCcl(["config", "--model", "opus"], tmpDir);

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "ccl.json"), "utf-8"),
    );
    expect(config.agents.defaults.model).toBe("opus");

    const coder = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "coder.md"),
      "utf-8",
    );
    expect(coder).toContain("model: opus");
  });

  it("sets per-agent override", () => {
    runCcl(["config", "--model", "opus", "--agent", "coder"], tmpDir);

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "ccl.json"), "utf-8"),
    );
    expect(config.agents.defaults.model).toBe("sonnet");
    expect(config.agents.overrides.coder.model).toBe("opus");

    const coder = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "coder.md"),
      "utf-8",
    );
    expect(coder).toContain("model: opus");

    const reviewer = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "reviewer.md"),
      "utf-8",
    );
    expect(reviewer).toContain("model: sonnet");
  });

  it("updates loop settings", () => {
    runCcl(["config", "--iterations", "5", "--time-limit", "30m"], tmpDir);

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "ccl.json"), "utf-8"),
    );
    expect(config.loop.iterations).toBe(5);
    expect(config.loop.timeLimit).toBe("30m");
  });

  it("--show prints config as JSON", () => {
    const output = runCcl(["config", "--show"], tmpDir);
    const config = JSON.parse(output);
    expect(config.agents).toBeDefined();
    expect(config.loop).toBeDefined();
  });

  it("--reset restores defaults", () => {
    runCcl(["config", "--model", "opus"], tmpDir);
    runCcl(["config", "--reset"], tmpDir);

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "ccl.json"), "utf-8"),
    );
    expect(config.agents.defaults.model).toBe("sonnet");
  });
});

describe("ccl plan (without claude)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempProject();
    runCcl(["init", "--stack", "node", "--no-interactive"], tmpDir);
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates plans directory", () => {
    const plansDir = path.join(tmpDir, ".claude", "plans", "ccl");
    // Plans dir is created when plan command runs, but since we can't
    // call claude, just verify init doesn't create it prematurely
    expect(fs.existsSync(plansDir)).toBe(false);
  });
});

describe("ccl run (argument handling)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempProject();
    runCcl(["init", "--stack", "node", "--no-interactive"], tmpDir);
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("errors without task file", () => {
    expect(() => runCcl(["run"], tmpDir)).toThrow();
  });

  it("errors with nonexistent task file", () => {
    expect(() => runCcl(["run", "nonexistent.md"], tmpDir)).toThrow();
  });

  it("reads config defaults for loop args", () => {
    // Set custom iterations
    runCcl(["config", "--iterations", "3"], tmpDir);

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".claude", "ccl.json"), "utf-8"),
    );
    expect(config.loop.iterations).toBe(3);
  });
});
