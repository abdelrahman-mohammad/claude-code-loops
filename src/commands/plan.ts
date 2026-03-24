import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  p.intro(pc.cyan("claude-code-loops plan") + " — generate task file from requirements");

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
        { encoding: "utf-8", timeout: 30_000 },
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
  const systemPromptPath = path.join(
    TEMPLATES_DIR,
    "base",
    "prompts",
    "plan-system-prompt.md",
  );

  let systemPrompt = "";
  if (fs.existsSync(systemPromptPath)) {
    systemPrompt = fs.readFileSync(systemPromptPath, "utf-8");
  }

  const fullPrompt = `${systemPrompt}

## Context
- Tech stack: ${stack}

## Requirements
${requirements}

Generate the task file now.`;

  const spinner = p.spinner();
  spinner.start("Analyzing requirements with Claude Code...");

  try {
    const output = execFileSync(
      "claude",
      ["-p", fullPrompt, "--output-format", "text", "--max-turns", "3"],
      {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 10,
        timeout: 180_000,
      },
    );

    spinner.stop("Task file generated");

    fs.writeFileSync(options.output, output.trim() + "\n", "utf-8");
    p.log.success(`Written to ${pc.cyan(options.output)}`);

    const lines = output.trim().split("\n");
    const preview = lines.slice(0, 15).join("\n");
    const taskCount = (output.match(/- \[ \]/g) || []).length;

    p.note(
      preview + (lines.length > 15 ? `\n... (${lines.length - 15} more lines)` : ""),
      `${taskCount} tasks generated`,
    );

    p.outro(
      `Next: ${pc.cyan(`claude-code-loops run ${options.output} --iterations 5`)}`,
    );
  } catch (err) {
    spinner.stop("Failed");
    p.log.error(
      "Claude Code CLI failed. Is it installed and authenticated?",
    );
    if (err instanceof Error) p.log.message(pc.dim(err.message));
    process.exit(1);
  }
}
