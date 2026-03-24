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
      output = await runClaudeStream(userPrompt, { systemPrompt: body });
    }

    fs.writeFileSync(options.output, output.trim() + "\n", "utf-8");
    p.log.success(`Written to ${pc.cyan(options.output)}`);

    const taskCount = (output.match(/- \[ \]/g) || []).length;
    const lines = output.trim().split("\n");
    const preview = lines.slice(0, 15).join("\n");

    p.note(
      preview +
        (lines.length > 15 ? `\n... (${lines.length - 15} more lines)` : ""),
      `${taskCount} tasks generated`,
    );

    p.outro(
      `Next: ${pc.cyan(`claude-code-loops run ${options.output} --iterations 5`)}`,
    );
  } catch (err) {
    p.log.error("Claude Code CLI failed. Is it installed and authenticated?");
    if (err instanceof Error) p.log.message(pc.dim(err.message));
    process.exit(1);
  }
}

interface StreamOptions {
  agent?: string;
  systemPrompt?: string;
}

function runClaudeStream(
  userPrompt: string,
  options: StreamOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Write prompt to temp file to avoid shell escaping issues on Windows
    const promptFile = path.join(os.tmpdir(), `ccl-prompt-${Date.now()}.txt`);

    if (options.systemPrompt) {
      fs.writeFileSync(
        promptFile,
        options.systemPrompt + "\n\n" + userPrompt,
        "utf-8",
      );
    } else {
      fs.writeFileSync(promptFile, userPrompt, "utf-8");
    }

    const cleanup = () => {
      try {
        fs.unlinkSync(promptFile);
      } catch {}
    };

    const args = [
      ...(options.agent ? ["--agent", options.agent] : []),
      "-p",
      "Execute the plan request in the attached file.",
      "--append-system-prompt-file",
      promptFile,
      "--output-format",
      "stream-json",
      "--verbose",
      ...(options.agent ? [] : ["--max-turns", "3"]),
    ];

    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let resultText = "";
    let buffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();

      // Process complete JSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          processStreamEvent(event);

          // Collect assistant text for the final output
          if (event.type === "assistant" && event.message) {
            const msg = event.message as Record<string, unknown>;
            if (msg.content && Array.isArray(msg.content)) {
              for (const block of msg.content) {
                const b = block as Record<string, unknown>;
                if (b.type === "text" && typeof b.text === "string") {
                  resultText = b.text;
                }
              }
            }
          }

          // Also check for result type
          if (event.type === "result" && event.result) {
            const result = event.result as string;
            if (result) resultText = result;
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      reject(new Error("Claude Code CLI timed out after 10 minutes"));
    }, 600_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      if (code === 0 && resultText) {
        resolve(resultText);
      } else if (code === 0) {
        reject(new Error("Claude returned no output"));
      } else {
        reject(new Error(stderr || `claude exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });
  });
}

function processStreamEvent(event: Record<string, unknown>): void {
  if (event.type === "assistant" && event.message) {
    const msg = event.message as Record<string, unknown>;
    if (msg.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (b.type === "tool_use" && typeof b.name === "string") {
          const input = b.input as Record<string, unknown> | undefined;
          const detail = getToolDetail(b.name, input);
          p.log.step(pc.dim(`${b.name}${detail ? `: ${detail}` : ""}`));
        }
      }
    }
  }
}

function getToolDetail(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string {
  if (!input) return "";

  switch (toolName) {
    case "Read":
      return typeof input.file_path === "string"
        ? path.basename(input.file_path)
        : "";
    case "Glob":
      return typeof input.pattern === "string" ? input.pattern : "";
    case "Grep":
      return typeof input.pattern === "string" ? `"${input.pattern}"` : "";
    case "Bash":
      return typeof input.command === "string"
        ? input.command.slice(0, 60)
        : "";
    case "Write":
      return typeof input.file_path === "string"
        ? path.basename(input.file_path)
        : "";
    default:
      return "";
  }
}
