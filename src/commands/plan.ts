import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectStack } from "../utils/detect-stack.js";
import { TEMPLATES_DIR } from "../utils/copy.js";
import { runClaudeStream } from "../utils/claude-stream.js";

const PLANS_DIR = path.join(".claude", "plans", "ccl");

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

  // Ensure plans directory exists
  const plansDir = path.resolve(process.cwd(), PLANS_DIR);
  fs.mkdirSync(plansDir, { recursive: true });

  // Snapshot existing plan files so we can detect what was created
  const existingFiles = new Set(fs.readdirSync(plansDir));

  const userPrompt = [
    `## Context`,
    `- Tech stack: ${stack}`,
    `- Today's date: ${today}`,
    ``,
    `## Requirements`,
    requirements,
    ``,
    `## Output Instructions`,
    `Write the plan to a file at: ${PLANS_DIR}/${today}-<slug>.md`,
    `where <slug> is a kebab-case name of up to 4 words describing the feature.`,
    `Example: ${PLANS_DIR}/${today}-digest-parser-multi-format.md`,
    ``,
    `The plan file must include the full date and time in the "Generated" field.`,
    ``,
    `Generate the task plan now.`,
  ].join("\n");

  p.log.step("Starting Claude Code...");

  try {
    if (usesAgent) {
      await runClaudeStream(userPrompt, { agent: "planner" });
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
      await runClaudeStream(userPrompt, {
        systemPrompt: body,
        maxTurns: 15,
      });
    }

    // Find the plan file the agent created
    const currentFiles = fs.readdirSync(plansDir);
    const newFiles = currentFiles.filter((f) => !existingFiles.has(f));

    if (newFiles.length === 0) {
      p.log.error("Planner did not create a plan file.");
      process.exit(1);
    }

    const planFile = path.join(PLANS_DIR, newFiles[0]);
    const planContent = fs.readFileSync(
      path.resolve(process.cwd(), planFile),
      "utf-8",
    );

    // If user specified --output, copy the file there
    if (options.output) {
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, planContent, "utf-8");
      planFile === options.output ||
        p.log.info(`Also saved to ${pc.cyan(options.output)}`);
    }

    const taskCount = (planContent.match(/- \[ \]/g) || []).length;
    p.log.success(`Written to ${pc.cyan(planFile)} (${taskCount} tasks)`);

    p.outro(
      `Next: ${pc.cyan(`claude-code-loops run ${planFile} --iterations 5`)}`,
    );
  } catch (err) {
    p.log.error("Claude Code CLI failed. Is it installed and authenticated?");
    if (err instanceof Error) p.log.message(pc.dim(err.message));
    process.exit(1);
  }
}
