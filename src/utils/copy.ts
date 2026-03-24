import fs from "node:fs";
import fse from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { replaceTemplateVars } from "./template-vars.js";
import { mergeSettings } from "./merge-settings.js";
import { mergeCLAUDEmd } from "./merge-claude-md.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In built mode: dist/index.js --> ../templates
// In dev/test mode: src/utils/copy.ts --> ../../templates
function findTemplatesDir(): string {
    // Try relative to dist/ (built mode)
    const fromDist = path.resolve(__dirname, "..", "templates");
    if (fs.existsSync(fromDist)) return fromDist;

    // Try relative to src/utils/ (dev/test mode)
    const fromSrc = path.resolve(__dirname, "..", "..", "templates");
    if (fs.existsSync(fromSrc)) return fromSrc;

    return fromDist; // fallback
}

export const TEMPLATES_DIR = findTemplatesDir();

export type MergeBehavior = "merge" | "overwrite" | "backup";

export interface CopyOptions {
    mergeBehavior: MergeBehavior;
    templateVars: Record<string, string>;
    includeScripts?: boolean;
}

/**
 * Recursively collect all file paths relative to a root directory.
 */
function collectFiles(dir: string, base: string = ""): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(path.join(dir, entry.name), rel));
        } else {
            files.push(rel);
        }
    }
    return files;
}

/**
 * Merge .claudeignore: append new lines, skip duplicates.
 */
function mergeClaudeignore(existing: string, incoming: string): string {
    const existingLines = new Set(
        existing
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
    );
    const incomingLines = incoming
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const newLines = incomingLines.filter((l) => !existingLines.has(l));
    if (newLines.length === 0) return existing;
    const base = existing.endsWith("\n") ? existing : existing + "\n";
    return base + newLines.join("\n") + "\n";
}

/**
 * Copy a template directory to the destination with smart merge behavior.
 * Returns the list of files that were written (relative to destDir).
 */
export async function copyTemplateDir(srcDir: string, destDir: string, options: CopyOptions): Promise<string[]> {
    const { mergeBehavior, templateVars, includeScripts = true } = options;
    const copiedFiles: string[] = [];

    if (!fs.existsSync(srcDir)) return copiedFiles;

    const relFiles = collectFiles(srcDir);

    for (const relFile of relFiles) {
        const srcPath = path.join(srcDir, relFile);
        const fileName = path.basename(relFile);

        // Skip scripts if not requested
        if (!includeScripts && relFile.startsWith("scripts")) continue;

        const destRelFile = relFile;
        const destPath = path.join(destDir, destRelFile);
        const destExists = fs.existsSync(destPath);

        // Read source content
        const srcContent = fs.readFileSync(srcPath, "utf-8");

        // --- Special file handling ---

        // CLAUDE.md: always merge (append with markers)
        if (fileName === "CLAUDE.md") {
            const processed = replaceTemplateVars(srcContent, templateVars);
            if (destExists) {
                const existingContent = fs.readFileSync(destPath, "utf-8");
                const merged = mergeCLAUDEmd(existingContent, processed);
                await fse.ensureDir(path.dirname(destPath));
                fs.writeFileSync(destPath, merged, "utf-8");
            } else {
                await fse.ensureDir(path.dirname(destPath));
                fs.writeFileSync(destPath, mergeCLAUDEmd("", processed), "utf-8");
            }
            copiedFiles.push(destRelFile);
            continue;
        }

        // settings.json: always merge (deep-merge hooks and permissions)
        if (fileName === "settings.json") {
            const incoming = JSON.parse(srcContent);
            if (destExists) {
                const existing = JSON.parse(fs.readFileSync(destPath, "utf-8"));
                const merged = mergeSettings(existing, incoming);
                fs.writeFileSync(destPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
            } else {
                await fse.ensureDir(path.dirname(destPath));
                fs.writeFileSync(destPath, JSON.stringify(incoming, null, 2) + "\n", "utf-8");
            }
            copiedFiles.push(destRelFile);
            continue;
        }

        // .claudeignore: merge (append new lines)
        if (fileName === ".claudeignore") {
            const processed = replaceTemplateVars(srcContent, templateVars);
            if (destExists) {
                const existingContent = fs.readFileSync(destPath, "utf-8");
                const merged = mergeClaudeignore(existingContent, processed);
                fs.writeFileSync(destPath, merged, "utf-8");
            } else {
                await fse.ensureDir(path.dirname(destPath));
                fs.writeFileSync(destPath, processed, "utf-8");
            }
            copiedFiles.push(destRelFile);
            continue;
        }

        // --- Standard files ---
        if (destExists && mergeBehavior === "merge") {
            // Skip existing files in merge mode
            continue;
        }

        const processed = replaceTemplateVars(srcContent, templateVars);
        await fse.ensureDir(path.dirname(destPath));
        fs.writeFileSync(destPath, processed, "utf-8");
        copiedFiles.push(destRelFile);

        // Set executable bit on shell scripts
        if (fileName.endsWith(".sh")) {
            try {
                fs.chmodSync(destPath, 0o755);
            } catch {
                // chmod may not work on Windows — that's fine
            }
        }
    }

    return copiedFiles;
}

/**
 * Back up existing .claude/ directory before overwriting.
 */
export async function backupClaudeDir(destDir: string): Promise<string | null> {
    const claudeDir = path.join(destDir, ".claude");
    if (!fs.existsSync(claudeDir)) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(destDir, `.claude.backup-${timestamp}`);
    await fse.copy(claudeDir, backupDir);
    return backupDir;
}
