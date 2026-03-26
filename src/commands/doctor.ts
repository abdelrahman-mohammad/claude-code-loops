import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readCclConfig, resolveAgentConfig } from "../utils/ccl-config.js";
import { parseFrontmatter } from "../utils/sync-agent-frontmatter.js";

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

interface SpawnResult {
  ok: boolean;
  output: string;
}

/** Run a command and return whether it succeeded plus its output. */
function spawnCheck(cmd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "pipe", shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", () =>
      resolve({ ok: false, output: stderr || "command not found" }),
    );
    child.on("close", (code) =>
      resolve({ ok: code === 0, output: stdout.trim() || stderr.trim() }),
    );
  });
}

/** Check whether the content has a YAML frontmatter block. */
function hasFrontmatter(content: string): boolean {
  const normalized = content.replace(/\r\n/g, "\n");
  return /^---\n[\s\S]*?\n---/.test(normalized);
}

/** Check whether Claude CLI is installed and reachable. */
export async function checkClaudeInstalled(): Promise<CheckResult> {
  const result = await spawnCheck("claude", ["--version"]);
  if (result.ok) {
    return {
      name: "Claude CLI",
      status: "pass",
      message: `Installed (${result.output})`,
    };
  }
  return {
    name: "Claude CLI",
    status: "fail",
    message: "Not found",
    fix: "Install Claude Code: npm install -g @anthropic-ai/claude-code",
  };
}

/** Check whether the destination directory is inside a git repository. */
export async function checkGitRepo(destDir: string): Promise<CheckResult> {
  const result = await spawnCheck("git", [
    "-C",
    destDir,
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  if (result.ok) {
    return { name: "Git repository", status: "pass", message: "Initialized" };
  }
  return {
    name: "Git repository",
    status: "fail",
    message: "Not a git repository",
    fix: "Run `git init` to initialize",
  };
}

/** Check whether the .claude/ directory exists. */
export function checkClaudeDir(destDir: string): CheckResult {
  if (fs.existsSync(path.join(destDir, ".claude"))) {
    return { name: ".claude/ directory", status: "pass", message: "Present" };
  }
  return {
    name: ".claude/ directory",
    status: "fail",
    message: "Missing",
    fix: "Run `ccl init` to scaffold configuration",
  };
}

/** Check whether ccl.json exists and is valid. */
export function checkCclConfig(destDir: string): CheckResult {
  const configPath = path.join(destDir, ".claude", "ccl.json");
  if (!fs.existsSync(configPath)) {
    return {
      name: "ccl.json",
      status: "warn",
      message: "Not found -- using defaults",
      fix: "Run `ccl init` or `ccl config` to create",
    };
  }

  try {
    const config = readCclConfig(destDir);
    if (config) {
      return { name: "ccl.json", status: "pass", message: "Valid" };
    }
  } catch {
    // JSON.parse failed — fall through to fail result
  }

  return {
    name: "ccl.json",
    status: "fail",
    message: "Invalid or malformed",
    fix: "Run `ccl config --reset` to regenerate",
  };
}

/** Check whether agent markdown files exist and have valid frontmatter. */
export function checkAgentFiles(destDir: string): CheckResult {
  const agentsDir = path.join(destDir, ".claude", "agents");
  if (!fs.existsSync(agentsDir)) {
    return {
      name: "Agent files",
      status: "fail",
      message: "No .claude/agents/ directory",
      fix: "Run `ccl init` to scaffold agents",
    };
  }

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    return {
      name: "Agent files",
      status: "fail",
      message: "No agent files found",
      fix: "Run `ccl init` to scaffold agents",
    };
  }

  const invalid: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(agentsDir, file), "utf-8");
    if (!hasFrontmatter(content)) {
      invalid.push(file);
    }
  }

  if (invalid.length > 0) {
    return {
      name: "Agent files",
      status: "warn",
      message: `${files.length} found, ${invalid.length} missing frontmatter: ${invalid.join(", ")}`,
      fix: "Add YAML frontmatter to agent files (---\\nmodel: sonnet\\n---)",
    };
  }

  return {
    name: "Agent files",
    status: "pass",
    message: `${files.length} valid`,
  };
}

/** Check whether agent frontmatter is in sync with ccl.json settings. */
export function checkFrontmatterSync(destDir: string): CheckResult {
  const config = readCclConfig(destDir);
  if (!config) {
    return {
      name: "Frontmatter sync",
      status: "warn",
      message: "No ccl.json to compare against",
    };
  }

  const agentsDir = path.join(destDir, ".claude", "agents");
  if (!fs.existsSync(agentsDir)) {
    return {
      name: "Frontmatter sync",
      status: "warn",
      message: "No agents directory",
    };
  }

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  const outOfSync: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(agentsDir, file), "utf-8");
    const fm = parseFrontmatter(content);
    if (Object.keys(fm.fields).length === 0) continue;

    const agentName = fm.fields.name ?? path.basename(file, ".md");
    const resolved = resolveAgentConfig(config, agentName);

    if (fm.fields.model && fm.fields.model !== resolved.model) {
      outOfSync.push(
        `${file}: model=${fm.fields.model}, expected ${resolved.model}`,
      );
    }
    if (
      fm.fields.maxTurns &&
      Number(fm.fields.maxTurns) !== resolved.maxTurns
    ) {
      outOfSync.push(
        `${file}: maxTurns=${fm.fields.maxTurns}, expected ${resolved.maxTurns}`,
      );
    }
  }

  if (outOfSync.length > 0) {
    return {
      name: "Frontmatter sync",
      status: "warn",
      message: outOfSync.join("; "),
      fix: "Run `ccl config` to sync agent frontmatter with ccl.json",
    };
  }

  return {
    name: "Frontmatter sync",
    status: "pass",
    message: "All agents in sync",
  };
}

/** Check whether the loop script exists and is executable. */
export function checkScripts(destDir: string): CheckResult {
  const scriptPath = path.join(destDir, "scripts", "loop.sh");
  if (!fs.existsSync(scriptPath)) {
    return {
      name: "Loop script",
      status: "fail",
      message: "scripts/loop.sh not found",
      fix: "Run `ccl init` to scaffold scripts",
    };
  }

  // Skip executable check on Windows
  if (process.platform === "win32") {
    return { name: "Loop script", status: "pass", message: "Present" };
  }

  try {
    fs.accessSync(scriptPath, fs.constants.X_OK);
    return {
      name: "Loop script",
      status: "pass",
      message: "Present and executable",
    };
  } catch {
    return {
      name: "Loop script",
      status: "warn",
      message: "Present but not executable",
      fix: "Run `chmod +x scripts/loop.sh`",
    };
  }
}

/** Format a status icon from a check result status. */
function statusIcon(status: CheckResult["status"]): string {
  switch (status) {
    case "pass":
      return pc.green("PASS");
    case "warn":
      return pc.yellow("WARN");
    case "fail":
      return pc.red("FAIL");
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Run all diagnostic checks and display results. */
export async function doctorCommand(): Promise<void> {
  p.intro(pc.cyan("ccl doctor"));

  const destDir = process.cwd();

  const checks: CheckResult[] = [];

  // Async checks
  checks.push(await checkClaudeInstalled());
  checks.push(await checkGitRepo(destDir));

  // Sync checks
  checks.push(checkClaudeDir(destDir));
  checks.push(checkCclConfig(destDir));
  checks.push(checkAgentFiles(destDir));
  checks.push(checkFrontmatterSync(destDir));
  checks.push(checkScripts(destDir));

  // Display results
  let hasIssues = false;
  for (const check of checks) {
    const icon = statusIcon(check.status);

    p.log.message(`  ${icon}  ${check.name}: ${check.message}`);

    if (check.fix && check.status !== "pass") {
      p.log.message(`        ${pc.dim("Fix:")} ${check.fix}`);
      hasIssues = true;
    }
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  p.outro(
    hasIssues
      ? `${passCount} passed, ${warnCount} warnings, ${failCount} failed`
      : pc.green("All checks passed"),
  );
}
