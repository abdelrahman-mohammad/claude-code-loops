import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { runPrompts } from "../prompts/interactive.js";
import { installBase, installerMap, stackLabels } from "../installers/index.js";
import { detectStack } from "../utils/detect-stack.js";
import { backupClaudeDir, type MergeBehavior } from "../utils/copy.js";

export interface InitOptions {
  stack?: string;
  interactive?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const destDir = process.cwd();
  const projectName = path.basename(destDir);
  const existingClaudeDir = fs.existsSync(path.join(destDir, ".claude"));
  const detectedStack = detectStack(destDir);
  const noInteractive = options.interactive === false;

  try {
    const { stack, mergeBehavior, includeScripts } = await runPrompts({
      stack: options.stack,
      existingClaudeDir,
      detectedStack,
      noInteractive,
    });

    // Validate stack
    if (!(stack in installerMap)) {
      p.log.error(
        `Unknown stack: ${stack}. Choose from: node, spring-boot, generic`,
      );
      process.exit(1);
    }

    const templateVars = { projectName };
    const copyOptions = {
      mergeBehavior: mergeBehavior as MergeBehavior,
      templateVars,
      includeScripts,
    };

    // Backup if requested
    if (mergeBehavior === "backup" && existingClaudeDir) {
      const backupPath = await backupClaudeDir(destDir);
      if (backupPath) {
        p.log.info(
          `Backed up existing .claude/ to ${pc.dim(path.basename(backupPath))}`,
        );
      }
    }

    // Install base templates
    const baseFiles = await installBase(destDir, copyOptions);

    // Install stack overlay
    const stackInstaller = installerMap[stack];
    const stackFiles = await stackInstaller(destDir, copyOptions);

    // Combine and deduplicate file lists
    const allFiles = [...new Set([...baseFiles, ...stackFiles])];

    // Summary
    if (!noInteractive) {
      p.log.success(`Scaffolded ${pc.cyan(stackLabels[stack])} configuration:`);
      for (const file of allFiles.sort()) {
        p.log.message(`  ${pc.green("+")} ${file}`);
      }

      p.note(
        [
          `1. Review ${pc.cyan("CLAUDE.md")} and customize for your project`,
          `2. Try: ${pc.cyan(`claude --agent ${stack === "spring-boot" ? "spring-coder" : "coder"} "Implement feature X"`)}`,
          includeScripts
            ? `3. Run the loop: ${pc.cyan("bash scripts/loop.sh task.md --iterations 3")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        "Next steps",
      );

      p.outro("Done!");
    } else {
      console.log(
        `Scaffolded ${stackLabels[stack]} configuration (${allFiles.length} files)`,
      );
      for (const file of allFiles.sort()) {
        console.log(`  + ${file}`);
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      p.log.error(err.message);
    }
    process.exit(1);
  }
}
