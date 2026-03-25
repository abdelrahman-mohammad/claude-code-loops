import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectStack } from "../utils/detect-stack.js";
import { TEMPLATES_DIR } from "../utils/copy.js";
import { runClaudeStream } from "../utils/claude-stream.js";

const PLANS_DIR = path.join(".claude", "plans", "ccl");

function extractPlanSlug(content: string): string {
  const match = content.match(/^#\s*Task Plan:\s*(.+)/m);
  const source = match ? match[1].trim() : content.slice(0, 80);
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 4)
    .join("-");
}

export interface PlanOptions {
  output?: string;
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
  const today = new Date().toISOString().slice(0, 10);

  const plannerAgentPath = path.join(
    process.cwd(),
    ".claude",
    "agents",
    "planner.md",
  );
  const usesAgent = fs.existsSync(plannerAgentPath);

  const userPrompt = [
    `## Context`,
    `- Tech stack: ${stack}`,
    `- Today's date and time: ${new Date().toISOString()}`,
    ``,
    `## Requirements`,
    requirements,
    ``,
    `Generate the task plan now. Output the plan as text — do NOT write any files.`,
  ].join("\n");

  p.log.step("Starting Claude Code...");

  try {
    let output: string;
    if (usesAgent) {
      output = await runClaudeStream(userPrompt, { agent: "planner" });
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
      output = await runClaudeStream(userPrompt, {
        systemPrompt: body,
        maxTurns: 15,
      });
    }

    // Extract slug from plan title, write file
    const slug = extractPlanSlug(output);
    const outputPath =
      options.output ?? path.join(PLANS_DIR, `${today}-${slug}.md`);
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, output.trim() + "\n", "utf-8");

    const taskCount = (output.match(/- \[ \]/g) || []).length;
    p.log.success(`Written to ${pc.cyan(outputPath)} (${taskCount} tasks)`);

    p.outro(
      `Next: ${pc.cyan(`claude-code-loops run ${outputPath} --iterations 5`)}`,
    );
  } catch (err) {
    p.log.error("Claude Code CLI failed. Is it installed and authenticated?");
    if (err instanceof Error) p.log.message(pc.dim(err.message));
    process.exit(1);
  }
}
