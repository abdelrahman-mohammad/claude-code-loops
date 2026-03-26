import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

export interface HistoryOptions {
  detail?: boolean;
  json?: boolean;
  last?: number;
}

export type ReviewVerdict = "pass" | "issues" | "fail" | "unknown";

export interface IterationLog {
  iteration: number;
  cost: number | null;
  turns: number | null;
  reviewVerdict: ReviewVerdict;
  issueCount: number;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  issueCount: number;
}

export interface LoopLogMeta {
  date: string | null;
  taskFile: string | null;
  maxIterations: number | null;
  stopReason: string | null;
  totalCost: number | null;
  duration: string | null;
}

export interface RunSummary {
  runId: string | null;
  date: string | null;
  taskFile: string | null;
  iterationsCompleted: number;
  maxIterations: number | null;
  stopReason: string | null;
  totalCost: number | null;
  duration: string | null;
  iterations: IterationLog[];
}

/**
 * Parse a coder-iter-N.raw.json (stream-json: one JSON object per line)
 * or a legacy coder-iter-N.json (single JSON object) for cost and turns.
 */
export function parseCoderJson(content: string): {
  cost: number | null;
  turns: number | null;
} {
  try {
    const trimmed = content.trim();

    // Stream-json format: multiple JSON objects, one per line.
    // The last line typically contains the summary with cost/turns.
    if (trimmed.includes("\n")) {
      return parseStreamJson(trimmed);
    }

    // Single-object format (legacy)
    return parseSingleJson(trimmed);
  } catch {
    return { cost: null, turns: null };
  }
}

/** Parse a single JSON object for cost and turns. */
function parseSingleJson(content: string): {
  cost: number | null;
  turns: number | null;
} {
  const data = JSON.parse(content) as Record<string, unknown>;
  const cost =
    typeof data.total_cost_usd === "number" ? data.total_cost_usd : null;
  const turns = typeof data.num_turns === "number" ? data.num_turns : null;
  return { cost, turns };
}

/** Parse stream-json (one JSON object per line), scanning for cost/turns. */
function parseStreamJson(content: string): {
  cost: number | null;
  turns: number | null;
} {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  let cost: number | null = null;
  let turns: number | null = null;

  // Scan lines in reverse -- summary data is usually at the end
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(lines[i]) as Record<string, unknown>;
      if (cost === null && typeof data.total_cost_usd === "number") {
        cost = data.total_cost_usd;
      }
      if (turns === null && typeof data.num_turns === "number") {
        turns = data.num_turns;
      }
      if (cost !== null && turns !== null) break;
    } catch {
      // Skip malformed lines
    }
  }

  return { cost, turns };
}

/** Parse a review-iter-N.txt file for verdict and issue count. */
export function parseReviewTxt(content: string): ReviewResult {
  const upper = content.toUpperCase();
  if (upper.includes("LGTM") || upper.includes("PASS")) {
    return { verdict: "pass", issueCount: 0 };
  }

  // Count issue markers
  const criticalCount = (content.match(/\[CRITICAL\]/gi) ?? []).length;
  const highCount = (content.match(/\[HIGH\]/gi) ?? []).length;
  const importantCount = (content.match(/\[IMPORTANT\]/gi) ?? []).length;
  const mediumCount = (content.match(/\[MEDIUM\]/gi) ?? []).length;
  const suggestionCount = (content.match(/\[SUGGESTION\]/gi) ?? []).length;
  const total =
    criticalCount + highCount + importantCount + mediumCount + suggestionCount;

  if (total > 0) {
    return { verdict: "issues", issueCount: total };
  }

  // Fall back to checking for FAIL
  if (upper.includes("FAIL")) {
    return { verdict: "fail", issueCount: 0 };
  }

  return { verdict: "unknown", issueCount: 0 };
}

/** Parse loop.log for run metadata. */
export function parseLoopLog(content: string): LoopLogMeta {
  // Look for timestamp at start of log lines like "[2026-03-25 14:30:22]"
  const dateMatch = content.match(
    /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]/,
  );
  const date = dateMatch ? dateMatch[1] : null;

  // Task file
  const taskMatch = content.match(/Task file:\s*(.+)/i);
  const taskFile = taskMatch ? taskMatch[1].trim() : null;

  // Max iterations
  const iterMatch = content.match(/Iterations:\s*\d+\/(\d+)/);
  const maxIterations = iterMatch ? parseInt(iterMatch[1], 10) : null;

  // Stop reason
  const stopMatch = content.match(/Stop reason:\s*(.+)/i);
  const stopReason = stopMatch ? stopMatch[1].trim() : null;

  // Total cost
  const costMatch = content.match(/Cumulative cost:\s*\$?([\d.]+)/i);
  const totalCost = costMatch ? parseFloat(costMatch[1]) : null;

  // Elapsed time
  const elapsedMatch = content.match(/Elapsed time:\s*(\S+)/i);
  const duration = elapsedMatch ? elapsedMatch[1] : null;

  return { date, taskFile, maxIterations, stopReason, totalCost, duration };
}

/** Extract the iteration number from a filename like coder-iter-3.raw.json. */
function extractIterNum(filename: string): number {
  const match = filename.match(/coder-iter-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Scan a single run directory for .raw.json iteration files (new format). */
export function scanLogDirectory(logDir: string): IterationLog[] {
  if (!fs.existsSync(logDir)) return [];

  const files = fs.readdirSync(logDir);
  const iterations: IterationLog[] = [];

  // Prefer .raw.json files (new format), fall back to .json (legacy)
  let coderFiles = files
    .filter((f) => /^coder-iter-\d+\.raw\.json$/.test(f))
    .sort((a, b) => extractIterNum(a) - extractIterNum(b));

  if (coderFiles.length === 0) {
    coderFiles = files
      .filter((f) => /^coder-iter-\d+\.json$/.test(f))
      .sort((a, b) => extractIterNum(a) - extractIterNum(b));
  }

  for (const jsonFile of coderFiles) {
    const iterNum = extractIterNum(jsonFile);
    const jsonContent = fs.readFileSync(path.join(logDir, jsonFile), "utf-8");
    const { cost, turns } = parseCoderJson(jsonContent);

    // Parse review txt if exists
    const reviewFile = `review-iter-${iterNum}.txt`;
    let reviewVerdict: ReviewVerdict = "unknown";
    let issueCount = 0;
    if (files.includes(reviewFile)) {
      const reviewContent = fs.readFileSync(
        path.join(logDir, reviewFile),
        "utf-8",
      );
      const parsed = parseReviewTxt(reviewContent);
      reviewVerdict = parsed.verdict;
      issueCount = parsed.issueCount;
    }

    iterations.push({
      iteration: iterNum,
      cost,
      turns,
      reviewVerdict,
      issueCount,
    });
  }

  return iterations;
}

/** Check if a directory name matches the timestamped run format (YYYY-MM-DD-HHMMSS). */
function isRunDirectory(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(name);
}

/** Build a RunSummary from a single run directory. */
function buildRunSummary(runDir: string, runId: string | null): RunSummary {
  const iterations = scanLogDirectory(runDir);

  const loopLogPath = path.join(runDir, "loop.log");
  let logMeta: LoopLogMeta = {
    date: null,
    taskFile: null,
    maxIterations: null,
    stopReason: null,
    totalCost: null,
    duration: null,
  };
  if (fs.existsSync(loopLogPath)) {
    const logContent = fs.readFileSync(loopLogPath, "utf-8");
    logMeta = parseLoopLog(logContent);
  }

  return {
    runId,
    date: logMeta.date,
    taskFile: logMeta.taskFile,
    iterationsCompleted: iterations.length,
    maxIterations: logMeta.maxIterations,
    stopReason: logMeta.stopReason,
    totalCost: computeTotalCost(logMeta.totalCost, iterations),
    duration: logMeta.duration,
    iterations,
  };
}

/**
 * Scan a base logs directory for timestamped run subdirectories.
 * Returns an array of RunSummary objects sorted newest first.
 */
export function scanRunDirectories(baseDir: string): RunSummary[] {
  if (!fs.existsSync(baseDir)) return [];

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const runDirs = entries
    .filter((e) => e.isDirectory() && isRunDirectory(e.name))
    .map((e) => e.name)
    .sort()
    .reverse(); // newest first

  return runDirs.map((dirName) => {
    const runDir = path.join(baseDir, dirName);
    return buildRunSummary(runDir, dirName);
  });
}

/** Compute the total cost from iteration data or loop.log metadata. */
function computeTotalCost(
  logMetaCost: number | null,
  iterations: IterationLog[],
): number | null {
  if (logMetaCost !== null) return logMetaCost;
  const sum = iterations.reduce((acc, i) => acc + (i.cost ?? 0), 0);
  return sum > 0 ? sum : null;
}

/** Build summary lines for display. */
function buildSummaryLines(summary: RunSummary): string[] {
  const lines: string[] = [];

  if (summary.taskFile) lines.push(`Task:        ${summary.taskFile}`);

  const iterLabel = summary.maxIterations
    ? `${summary.iterationsCompleted} / ${summary.maxIterations}`
    : `${summary.iterationsCompleted}`;
  lines.push(`Iterations:  ${iterLabel}`);

  if (summary.stopReason) lines.push(`Stop reason: ${summary.stopReason}`);
  if (summary.totalCost !== null)
    lines.push(`Total cost:  $${summary.totalCost.toFixed(2)}`);
  if (summary.duration) lines.push(`Duration:    ${summary.duration}`);

  return lines;
}

/** Format the review verdict with color. */
function formatVerdict(iter: IterationLog): string {
  switch (iter.reviewVerdict) {
    case "pass":
      return pc.green("PASSED");
    case "issues":
      return pc.yellow(
        `${iter.issueCount} issue${iter.issueCount === 1 ? "" : "s"}`,
      );
    case "fail":
      return pc.red("FAILED");
    case "unknown":
      return pc.dim("no review");
    default: {
      const _exhaustive: never = iter.reviewVerdict;
      return String(_exhaustive);
    }
  }
}

/** Display a single run's detail (per-iteration breakdown). */
function displayRunDetail(summary: RunSummary): void {
  for (const iter of summary.iterations) {
    const parts: string[] = [];
    if (iter.turns !== null) parts.push(`${iter.turns} turns`);
    if (iter.cost !== null) parts.push(`$${iter.cost.toFixed(2)}`);

    const reviewPart = formatVerdict(iter);

    p.log.message(
      `  Iteration ${iter.iteration}:  Coder: ${parts.join(", ")}  |  Review: ${reviewPart}`,
    );
  }
}

/** Show loop run history, scanning per-run directories with flat fallback. */
export async function historyCommand(options: HistoryOptions): Promise<void> {
  const destDir = process.cwd();
  const newLogDir = path.join(destDir, ".claude", "ccl", "logs");
  const legacyLogDir = path.join(destDir, ".claude", "logs");

  // Try new per-run directory layout first
  let summaries = scanRunDirectories(newLogDir);

  // Fall back to legacy flat directory
  if (summaries.length === 0) {
    const legacySummary = buildRunSummary(legacyLogDir, null);
    if (legacySummary.iterations.length > 0) {
      summaries = [legacySummary];
    }
  }

  // Apply --last limit
  if (options.last !== undefined && options.last > 0) {
    summaries = summaries.slice(0, options.last);
  }

  if (options.json) {
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }

  p.intro(pc.cyan("ccl history"));

  if (summaries.length === 0) {
    p.log.warn("No loop runs found in .claude/ccl/logs/ or .claude/logs/");
    p.log.info("Run " + pc.cyan("ccl run task.md") + " to start a loop");
    p.outro("");
    return;
  }

  for (const summary of summaries) {
    const title = summary.runId ? `Run ${summary.runId}` : "Latest run";
    p.note(buildSummaryLines(summary).join("\n"), title);

    if (options.detail) {
      displayRunDetail(summary);
    }
  }

  p.outro("");
}
