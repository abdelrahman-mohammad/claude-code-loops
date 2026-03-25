import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";

export interface ClaudeStreamOptions {
  agent?: string;
  systemPrompt?: string;
  maxTurns?: number;
  timeoutMs?: number;
  permissionMode?: string;
}

export interface StreamCallbacks {
  onToolUse?: (toolName: string, detail: string) => void;
  onText?: (text: string) => void;
}

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

let lastToolLog = "";

/**
 * Run claude CLI with stream-json output, parsing events in real-time.
 * Returns the final assistant text output.
 */
export function runClaudeStream(
  userPrompt: string,
  options: ClaudeStreamOptions,
  callbacks?: StreamCallbacks,
): Promise<string> {
  return new Promise((resolve, reject) => {
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

    const cleanup = (): void => {
      try {
        fs.unlinkSync(promptFile);
      } catch {
        // ignore
      }
    };

    const args = [
      ...(options.agent ? ["--agent", options.agent] : []),
      "-p",
      "Execute the request in the attached file.",
      "--append-system-prompt-file",
      promptFile,
      "--output-format",
      "stream-json",
      "--verbose",
      ...(options.maxTurns ? ["--max-turns", String(options.maxTurns)] : []),
      ...(options.permissionMode
        ? ["--permission-mode", options.permissionMode]
        : []),
    ];

    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let resultText = "";
    let buffer = "";
    lastToolLog = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          const extracted = processStreamEvent(event, callbacks);
          if (extracted) resultText = extracted;
        } catch {
          // Not valid JSON, skip
        }
      }
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      reject(
        new Error(
          `Claude Code CLI timed out after ${Math.round(timeout / 60_000)} minutes`,
        ),
      );
    }, timeout);

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

/**
 * Process a single stream-json event. Returns extracted text if found.
 */
function processStreamEvent(
  event: Record<string, unknown>,
  callbacks?: StreamCallbacks,
): string | undefined {
  let extractedText: string | undefined;

  if (event.type === "assistant" && event.message) {
    const msg = event.message as Record<string, unknown>;
    if (msg.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;

        if (b.type === "tool_use" && typeof b.name === "string") {
          const input = b.input as Record<string, unknown> | undefined;
          const detail = getToolDetail(b.name, input);
          const logLine = `${b.name}${detail ? `: ${detail}` : ""}`;
          if (logLine !== lastToolLog) {
            lastToolLog = logLine;
            if (callbacks?.onToolUse) {
              callbacks.onToolUse(b.name, detail);
            } else {
              p.log.step(pc.dim(logLine));
            }
          }
        }

        if (b.type === "text" && typeof b.text === "string") {
          extractedText = b.text;
          callbacks?.onText?.(b.text);
        }
      }
    }
  }

  if (event.type === "result" && event.result) {
    const result = event.result as string;
    if (result) extractedText = result;
  }

  return extractedText;
}

/**
 * Extract a human-readable detail string from a tool's input.
 */
function getToolDetail(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string {
  if (!input) return "";

  switch (toolName) {
    case "Read":
      if (typeof input.file_path === "string") {
        const rel = path.relative(process.cwd(), input.file_path);
        return rel.length < 80 ? rel : path.basename(input.file_path);
      }
      return "";
    case "Glob":
      return typeof input.pattern === "string" ? input.pattern : "";
    case "Grep":
      return typeof input.pattern === "string" ? `"${input.pattern}"` : "";
    case "Bash": {
      if (typeof input.command !== "string") return "";
      const cmd = input.command
        .replace(/^cd\s+"[^"]*"\s*&&?\s*/i, "")
        .replace(/^cd\s+\S+\s*&&?\s*/i, "");
      return cmd.slice(0, 80);
    }
    case "Write":
      if (typeof input.file_path === "string") {
        const rel = path.relative(process.cwd(), input.file_path);
        return rel.length < 80 ? rel : path.basename(input.file_path);
      }
      return "";
    case "Edit":
    case "MultiEdit":
      return typeof input.file_path === "string"
        ? path.basename(input.file_path)
        : "";
    case "ToolSearch":
      return typeof input.query === "string" ? input.query : "";
    default:
      return "";
  }
}

/**
 * Parse stream-json lines from stdin, print tool activity to stderr,
 * and write the final result text to stdout.
 * Used as a standalone filter script for loop.sh.
 */
export function runStreamFilter(): void {
  let buffer = "";
  let resultText = "";
  lastToolLog = "";

  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        const extracted = processStreamEvent(event, {
          onToolUse: (name: string, detail: string) => {
            const logLine = `  ${name}${detail ? `: ${detail}` : ""}`;
            process.stderr.write(logLine + "\n");
          },
        });
        if (extracted) resultText = extracted;
      } catch {
        // Not valid JSON, skip
      }
    }
  });

  process.stdin.on("end", () => {
    if (resultText) {
      process.stdout.write(resultText);
    }
  });
}
