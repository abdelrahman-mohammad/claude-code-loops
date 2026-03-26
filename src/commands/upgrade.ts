import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { TEMPLATES_DIR, collectFiles, copyTemplateDir } from "../utils/copy.js";
import { detectStack } from "../utils/detect-stack.js";
import { syncAgentFrontmatter } from "../utils/sync-agent-frontmatter.js";
import { stackLabels } from "../installers/index.js";

export interface UpgradeOptions {
  force?: boolean;
  dryRun?: boolean;
}

export interface FileDiff {
  relativePath: string;
  status: "unchanged" | "modified" | "new";
}

/** Compare template files against installed files and return per-file status. */
export function computeUpgradeDiff(
  templateFiles: string[],
  templateDir: string,
  destDir: string,
): FileDiff[] {
  const diffs: FileDiff[] = [];

  for (const relPath of templateFiles) {
    const templatePath = path.join(templateDir, relPath);
    const destPath = path.join(destDir, relPath);

    if (!fs.existsSync(destPath)) {
      diffs.push({ relativePath: relPath, status: "new" });
      continue;
    }

    const templateContent = fs.readFileSync(templatePath, "utf-8");
    const destContent = fs.readFileSync(destPath, "utf-8");

    if (templateContent === destContent) {
      diffs.push({ relativePath: relPath, status: "unchanged" });
    } else {
      diffs.push({ relativePath: relPath, status: "modified" });
    }
  }

  return diffs;
}

/** Log a summary table of file changes. */
function logChangeSummary(allDiffs: FileDiff[]): void {
  const changeLines: string[] = [];
  for (const diff of allDiffs) {
    if (diff.status === "modified") {
      changeLines.push(`  ${pc.yellow("M")}  ${diff.relativePath}`);
    } else if (diff.status === "new") {
      changeLines.push(`  ${pc.green("+")}  ${diff.relativePath}`);
    } else {
      changeLines.push(`  ${pc.dim("=")}  ${pc.dim(diff.relativePath)}`);
    }
  }
  p.note(changeLines.join("\n"), "File changes");
}

/** Apply template upgrades from base and stack overlay directories. */
async function applyUpgrade(
  baseDir: string,
  stackDir: string,
  destDir: string,
): Promise<void> {
  const upgradeOptions = {
    mergeBehavior: "overwrite" as const,
    templateVars: { projectName: path.basename(destDir) },
  };

  await copyTemplateDir(baseDir, destDir, upgradeOptions);
  if (fs.existsSync(stackDir)) {
    await copyTemplateDir(stackDir, destDir, upgradeOptions);
  }
}

/** Update scaffolded files to the latest template versions. */
export async function upgradeCommand(options: UpgradeOptions): Promise<void> {
  const destDir = process.cwd();

  if (!fs.existsSync(path.join(destDir, ".claude"))) {
    p.log.error(
      "No .claude/ directory found. Run " + pc.cyan("ccl init") + " first.",
    );
    process.exit(1);
  }

  p.intro(pc.cyan("ccl upgrade"));

  const stack = detectStack(destDir);
  const stackLabel = stackLabels[stack] ?? stack;
  p.log.info(`Detected stack: ${pc.cyan(stackLabel)}`);

  const baseDir = path.join(TEMPLATES_DIR, "base");
  const stackDir = path.join(TEMPLATES_DIR, stack);

  const baseFiles = collectFiles(baseDir);
  const stackFiles = fs.existsSync(stackDir) ? collectFiles(stackDir) : [];

  const baseDiffs = computeUpgradeDiff(baseFiles, baseDir, destDir);
  const stackDiffs = fs.existsSync(stackDir)
    ? computeUpgradeDiff(stackFiles, stackDir, destDir)
    : [];

  const allDiffs = [...baseDiffs, ...stackDiffs];
  const modified = allDiffs.filter((d) => d.status === "modified");
  const newFiles = allDiffs.filter((d) => d.status === "new");
  const unchanged = allDiffs.filter((d) => d.status === "unchanged");

  if (modified.length === 0 && newFiles.length === 0) {
    p.log.success("All files are up to date -- nothing to upgrade");
    p.outro("");
    return;
  }

  logChangeSummary(allDiffs);
  p.log.info(
    `${modified.length} modified, ${newFiles.length} new, ${unchanged.length} unchanged`,
  );

  if (options.dryRun) {
    p.outro("Dry run -- no changes applied");
    return;
  }

  if (!options.force) {
    const proceed = await p.confirm({
      message:
        "Apply upgrade? Agent frontmatter will be synced from ccl.json after.",
    });

    if (p.isCancel(proceed) || !proceed) {
      p.outro("Upgrade cancelled");
      return;
    }
  }

  const spinner = p.spinner();
  spinner.start("Upgrading files...");

  await applyUpgrade(baseDir, stackDir, destDir);
  syncAgentFrontmatter(destDir);

  spinner.stop("Files upgraded");

  p.outro(pc.green("Upgrade complete"));
}
