import * as p from "@clack/prompts";
import pc from "picocolors";
import type { StackName } from "../installers/index.js";
import type { MergeBehavior } from "../utils/copy.js";

export interface PromptResults {
  stack: StackName;
  mergeBehavior: MergeBehavior;
  includeScripts: boolean;
}

export async function runPrompts(options: {
  stack?: string;
  existingClaudeDir: boolean;
  detectedStack: StackName;
  noInteractive?: boolean;
}): Promise<PromptResults> {
  const { stack, existingClaudeDir, detectedStack, noInteractive } = options;

  // Non-interactive mode: use flags and defaults
  if (noInteractive || stack) {
    const resolvedStack = (stack as StackName) || detectedStack;
    return {
      stack: resolvedStack,
      mergeBehavior: existingClaudeDir ? "merge" : "overwrite",
      includeScripts: true,
    };
  }

  // Interactive mode
  p.intro(pc.cyan("claude-code-loops") + " — Claude Code configuration scaffolder");

  const result = await p.group(
    {
      stack: () =>
        p.select({
          message: "Choose your stack:",
          options: [
            {
              label: `Node.js / TypeScript${detectedStack === "node" ? pc.dim(" (detected)") : ""}`,
              value: "node" as StackName,
            },
            {
              label: `Next.js${detectedStack === "nextjs" ? pc.dim(" (detected)") : ""}`,
              value: "nextjs" as StackName,
            },
            {
              label: `Java / Spring Boot${detectedStack === "spring-boot" ? pc.dim(" (detected)") : ""}`,
              value: "spring-boot" as StackName,
            },
            {
              label: `Python / FastAPI${detectedStack === "fastapi" ? pc.dim(" (detected)") : ""}`,
              value: "fastapi" as StackName,
            },
            {
              label: `Python / Django${detectedStack === "django" ? pc.dim(" (detected)") : ""}`,
              value: "django" as StackName,
            },
            {
              label: `Generic${detectedStack === "generic" ? pc.dim(" (detected)") : ""}`,
              value: "generic" as StackName,
            },
          ],
          initialValue: detectedStack,
        }),
      mergeBehavior: () => {
        if (!existingClaudeDir) return Promise.resolve("overwrite" as MergeBehavior);
        return p.select({
          message: "Existing .claude/ directory found. How to handle?",
          options: [
            {
              label: "Merge (add new files, skip existing)",
              value: "merge" as MergeBehavior,
            },
            {
              label: "Overwrite all",
              value: "overwrite" as MergeBehavior,
            },
            {
              label: "Backup existing, then overwrite",
              value: "backup" as MergeBehavior,
            },
          ],
        });
      },
      includeScripts: () =>
        p.confirm({
          message: "Include orchestration script (scripts/loop.sh)?",
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  return {
    stack: result.stack,
    mergeBehavior: result.mergeBehavior,
    includeScripts: result.includeScripts,
  };
}
