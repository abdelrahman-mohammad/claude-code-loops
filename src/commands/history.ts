import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

export interface HistoryOptions {
  detail?: boolean;
  json?: boolean;
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
  date: string | null;
  taskFile: string | null;
  iterationsCompleted: number;
  maxIterations: number | null;
  stopReason: string | null;
  totalCost: number | null;
  duration: string | null;
  iterations: IterationLog[];
}

/** Parse a coder-iter-N.json file for cost and turns. */
export function parseCoderJson(content: string): {
  cost: number | null;
  turns: number | null;
} {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    const cost =
      typeof data.total_cost_usd === "number" ? data.total_cost_usd : null;
    const turns = typeof data.num_turns === "number" ? data.num_turns : null;
    return { cost, turns };
  } catch {
    return { cost: null, turns: null };
  }
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

/** Extract the iteration number from a filename like coder-iter-3.json. */
function extractIterNum(filename: string): number {
  return parseInt(filename.match(/\d+/)?.[0] ?? "0", 10);
}

/** Scan log directory and build iteration data. */
export function scanLogDirectory(logDir: string): IterationLog[] {
  if (!fs.existsSync(logDir)) return [];

  const files = fs.readdirSync(logDir);
  const iterations: IterationLog[] = [];

  // Find all coder-iter-N.json files
  const coderJsonFiles = files
    .filter((f) => /^coder-iter-\d+\.json$/.test(f))
    .sort((a, b) => extractIterNum(a) - extractIterNum(b));

  for (const jsonFile of coderJsonFiles) {
    const iterNum = extractIterNum(jsonFile);

    // Parse coder JSON
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

  if (summary.date) lines.push(`Date:        ${summary.date}`);
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

/** Show the latest loop run history. */
export async function historyCommand(options: HistoryOptions): Promise<void> {
  const destDir = process.cwd();
  const logDir = path.join(destDir, ".claude", "logs");

  // Scan iterations
  const iterations = scanLogDirectory(logDir);

  // Parse loop.log for metadata
  const loopLogPath = path.join(logDir, "loop.log");
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

  // Build summary
  const summary: RunSummary = {
    date: logMeta.date,
    taskFile: logMeta.taskFile,
    iterationsCompleted: iterations.length,
    maxIterations: logMeta.maxIterations,
    stopReason: logMeta.stopReason,
    totalCost: computeTotalCost(logMeta.totalCost, iterations),
    duration: logMeta.duration,
    iterations,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  p.intro(pc.cyan("ccl history"));

  if (iterations.length === 0) {
    p.log.warn("No loop runs found in .claude/logs/");
    p.log.info("Run " + pc.cyan("ccl run task.md") + " to start a loop");
    p.outro("");
    return;
  }

  // Summary
  p.note(buildSummaryLines(summary).join("\n"), "Latest run");

  // Per-iteration detail
  if (options.detail) {
    for (const iter of iterations) {
      const parts: string[] = [];
      if (iter.turns !== null) parts.push(`${iter.turns} turns`);
      if (iter.cost !== null) parts.push(`$${iter.cost.toFixed(2)}`);

      const reviewPart = formatVerdict(iter);

      p.log.message(
        `  Iteration ${iter.iteration}:  Coder: ${parts.join(", ")}  |  Review: ${reviewPart}`,
      );
    }
  }

  p.outro("");
}
