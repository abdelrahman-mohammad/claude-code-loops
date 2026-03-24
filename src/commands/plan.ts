import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectStack } from "../utils/detect-stack.js";
import { TEMPLATES_DIR } from "../utils/copy.js";

export interface PlanOptions {
  output: string;
  prompt?: string;
  githubIssue?: string;
  stack?: string;
}

export async function planCommand(
  input: string | undefined,
  options: PlanOptions,
): Promise<void> {
  p.intro(
    pc.cyan("claude-code-loops plan") +
      " — generate task file from requirements",
  );

  let requirements: string;

  if (options.prompt) {
    requirements = options.prompt;
  } else if (options.githubIssue) {
    try {
      requirements = execFileSync(
        "gh",
        [
          "issue",
          "view",
          options.githubIssue,
          "--json",
          "title,body,labels",
          "--jq",
          '"# " + .title + "\\n\\n" + .body + "\\n\\nLabels: " + ([.labels[].name] | join(", "))',
        ],
        { encoding: "utf-8", timeout: 30_000, shell: true },
      );
    } catch {
      p.log.error(
        "Failed to fetch GitHub issue. Is the `gh` CLI installed and authenticated?",
      );
      process.exit(1);
    }
  } else if (input && fs.existsSync(input)) {
    requirements = fs.readFileSync(input, "utf-8");
  } else {
    const desc = await p.text({
      message: "Describe what you want to build:",
      placeholder:
        "Add user authentication with JWT tokens and refresh token rotation",
    });
    if (p.isCancel(desc)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    requirements = desc as string;
  }

  const stack = options.stack || detectStack(process.cwd());

  const plannerAgentPath = path.join(
    process.cwd(),
    ".claude",
    "agents",
    "planner.md",
  );
  const usesAgent = fs.existsSync(plannerAgentPath);

  const userPrompt = `## Context\n- Tech stack: ${stack}\n\n## Requirements\n${requirements}\n\nGenerate the task file now.`;

  const spinner = p.spinner();
  spinner.start("Analyzing requirements with Claude Code...");

  try {
    let output: string;
    if (usesAgent) {
      output = await runClaudeAgent(userPrompt);
    } else {
      const bundledPath = path.join(
        TEMPLATES_DIR,
        "base",
        ".claude",
        "agents",
        "planner.md",
      );
      const bundledContent = fs.readFileSync(bundledPath, "utf-8");
      const body = bundledContent.replace(/^---[\s\S]*?---\n?/, "");
      const tmpFile = path.join(os.tmpdir(), `ccl-plan-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, body, "utf-8");
      try {
        output = await runClaudeWithSystemPrompt(userPrompt, tmpFile);
      } finally {
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      }
    }

    spinner.stop("Task file generated");

    fs.writeFileSync(options.output, output.trim() + "\n", "utf-8");
    p.log.success(`Written to ${pc.cyan(options.output)}`);

    const lines = output.trim().split("\n");
    const preview = lines.slice(0, 15).join("\n");
    const taskCount = (output.match(/- \[ \]/g) || []).length;

    p.note(
      preview +
        (lines.length > 15 ? `\n... (${lines.length - 15} more lines)` : ""),
      `${taskCount} tasks generated`,
    );

    p.outro(
      `Next: ${pc.cyan(`claude-code-loops run ${options.output} --iterations 5`)}`,
    );
  } catch (err) {
    spinner.stop("Failed");
    p.log.error("Claude Code CLI failed. Is it installed and authenticated?");
    if (err instanceof Error) p.log.message(pc.dim(err.message));
    process.exit(1);
  }
}

function runClaudeWithSystemPrompt(
  userPrompt: string,
  systemPromptFile: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      userPrompt,
      "--append-system-prompt-file",
      systemPromptFile,
      "--output-format",
      "text",
      "--max-turns",
      "3",
    ];

    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude Code CLI timed out after 3 minutes"));
    }, 180_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `claude exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function runClaudeAgent(userPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "--agent",
      "planner",
      "-p",
      userPrompt,
      "--output-format",
      "text",
    ];

    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude Code CLI timed out after 5 minutes"));
    }, 300_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `claude exited with code ${code}`));
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
