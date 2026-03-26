import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseCoderJson,
  parseReviewTxt,
  parseLoopLog,
  scanLogDirectory,
  scanRunDirectories,
} from "../../src/commands/history.js";

describe("parseCoderJson", () => {
  it("extracts cost and turns from valid JSON", () => {
    const content = JSON.stringify({ total_cost_usd: 1.23, num_turns: 15 });
    const result = parseCoderJson(content);
    expect(result).toEqual({ cost: 1.23, turns: 15 });
  });

  it("returns nulls for invalid JSON", () => {
    const result = parseCoderJson("not json");
    expect(result).toEqual({ cost: null, turns: null });
  });

  it("returns nulls for missing fields", () => {
    const content = JSON.stringify({ other: "data" });
    const result = parseCoderJson(content);
    expect(result).toEqual({ cost: null, turns: null });
  });

  it("returns null for wrong field types", () => {
    const content = JSON.stringify({
      total_cost_usd: "not-a-number",
      num_turns: "also-not",
    });
    const result = parseCoderJson(content);
    expect(result).toEqual({ cost: null, turns: null });
  });

  it("handles zero values correctly", () => {
    const content = JSON.stringify({ total_cost_usd: 0, num_turns: 0 });
    const result = parseCoderJson(content);
    expect(result).toEqual({ cost: 0, turns: 0 });
  });

  it("extracts cost when only cost is present", () => {
    const content = JSON.stringify({ total_cost_usd: 0.5 });
    const result = parseCoderJson(content);
    expect(result).toEqual({ cost: 0.5, turns: null });
  });

  it("parses stream-json format (multiple lines)", () => {
    const lines = [
      JSON.stringify({ type: "message", content: "working..." }),
      JSON.stringify({ type: "result", total_cost_usd: 2.5, num_turns: 10 }),
    ].join("\n");
    const result = parseCoderJson(lines);
    expect(result).toEqual({ cost: 2.5, turns: 10 });
  });

  it("extracts cost and turns from different lines in stream-json", () => {
    const lines = [
      JSON.stringify({ num_turns: 8 }),
      JSON.stringify({ total_cost_usd: 1.1 }),
    ].join("\n");
    const result = parseCoderJson(lines);
    expect(result).toEqual({ cost: 1.1, turns: 8 });
  });

  it("skips malformed lines in stream-json", () => {
    const lines = [
      "not json at all",
      JSON.stringify({ total_cost_usd: 0.75, num_turns: 5 }),
    ].join("\n");
    const result = parseCoderJson(lines);
    expect(result).toEqual({ cost: 0.75, turns: 5 });
  });

  it("returns nulls when stream-json has no cost/turns fields", () => {
    const lines = [
      JSON.stringify({ type: "message" }),
      JSON.stringify({ type: "end" }),
    ].join("\n");
    const result = parseCoderJson(lines);
    expect(result).toEqual({ cost: null, turns: null });
  });
});

describe("parseReviewTxt", () => {
  it("detects LGTM as pass", () => {
    const result = parseReviewTxt("LGTM - no issues found");
    expect(result).toEqual({ verdict: "pass", issueCount: 0 });
  });

  it("detects PASS as pass", () => {
    const result = parseReviewTxt("PASS - everything looks good");
    expect(result).toEqual({ verdict: "pass", issueCount: 0 });
  });

  it("is case-insensitive for LGTM and PASS", () => {
    expect(parseReviewTxt("lgtm").verdict).toBe("pass");
    expect(parseReviewTxt("pass").verdict).toBe("pass");
    expect(parseReviewTxt("Lgtm").verdict).toBe("pass");
  });

  it("counts issue markers", () => {
    const content = "[CRITICAL] Bug here\n[HIGH] Another issue";
    const result = parseReviewTxt(content);
    expect(result).toEqual({ verdict: "issues", issueCount: 2 });
  });

  it("counts all issue severity levels", () => {
    const content = [
      "[CRITICAL] Critical bug",
      "[HIGH] High priority",
      "[IMPORTANT] Important fix",
      "[MEDIUM] Medium concern",
      "[SUGGESTION] Consider refactoring",
    ].join("\n");
    const result = parseReviewTxt(content);
    expect(result).toEqual({ verdict: "issues", issueCount: 5 });
  });

  it("detects FAIL verdict", () => {
    const result = parseReviewTxt("FAIL - tests broken");
    expect(result).toEqual({ verdict: "fail", issueCount: 0 });
  });

  it("returns unknown for ambiguous content", () => {
    const result = parseReviewTxt("some random text");
    expect(result).toEqual({ verdict: "unknown", issueCount: 0 });
  });

  it("returns unknown for empty content", () => {
    const result = parseReviewTxt("");
    expect(result).toEqual({ verdict: "unknown", issueCount: 0 });
  });

  it("prioritizes LGTM over issue markers", () => {
    // LGTM/PASS check happens before issue counting
    const result = parseReviewTxt("LGTM despite [MEDIUM] minor style nit");
    expect(result.verdict).toBe("pass");
  });
});

describe("parseLoopLog", () => {
  it("extracts metadata from log content", () => {
    const content = `[2026-03-25 14:30:22] Starting loop
Task file: implement-auth.md
Iterations: 3/10
Stop reason: smart_stop
Cumulative cost: $1.23
Elapsed time: 120s`;
    const result = parseLoopLog(content);
    expect(result.date).toBe("2026-03-25 14:30:22");
    expect(result.taskFile).toBe("implement-auth.md");
    expect(result.maxIterations).toBe(10);
    expect(result.stopReason).toBe("smart_stop");
    expect(result.totalCost).toBe(1.23);
    expect(result.duration).toBe("120s");
  });

  it("returns nulls for empty content", () => {
    const result = parseLoopLog("");
    expect(result).toEqual({
      date: null,
      taskFile: null,
      maxIterations: null,
      stopReason: null,
      totalCost: null,
      duration: null,
    });
  });

  it("extracts partial metadata when only some fields present", () => {
    const content = `[2026-03-25 10:00:00] Starting
Task file: fix-bug.md`;
    const result = parseLoopLog(content);
    expect(result.date).toBe("2026-03-25 10:00:00");
    expect(result.taskFile).toBe("fix-bug.md");
    expect(result.maxIterations).toBeNull();
    expect(result.stopReason).toBeNull();
    expect(result.totalCost).toBeNull();
    expect(result.duration).toBeNull();
  });

  it("handles cost without dollar sign", () => {
    const content = "Cumulative cost: 2.50";
    const result = parseLoopLog(content);
    expect(result.totalCost).toBe(2.5);
  });

  it("handles various iteration formats", () => {
    const content = "Iterations: 7/15";
    const result = parseLoopLog(content);
    expect(result.maxIterations).toBe(15);
  });
});

describe("scanLogDirectory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-history-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for nonexistent directory", () => {
    const result = scanLogDirectory(path.join(tmpDir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("scans .raw.json files (new format)", () => {
    fs.writeFileSync(
      path.join(tmpDir, "coder-iter-1.raw.json"),
      JSON.stringify({ total_cost_usd: 0.85, num_turns: 15 }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "review-iter-1.txt"),
      "[CRITICAL] Bug found\n[HIGH] Another issue",
    );
    fs.writeFileSync(
      path.join(tmpDir, "coder-iter-2.raw.json"),
      JSON.stringify({ total_cost_usd: 0.72, num_turns: 12 }),
    );
    fs.writeFileSync(path.join(tmpDir, "review-iter-2.txt"), "LGTM");

    const result = scanLogDirectory(tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      iteration: 1,
      cost: 0.85,
      turns: 15,
      reviewVerdict: "issues",
      issueCount: 2,
    });
    expect(result[1]).toEqual({
      iteration: 2,
      cost: 0.72,
      turns: 12,
      reviewVerdict: "pass",
      issueCount: 0,
    });
  });

  it("falls back to .json files when no .raw.json files exist", () => {
    fs.writeFileSync(
      path.join(tmpDir, "coder-iter-1.json"),
      JSON.stringify({ total_cost_usd: 1.0, num_turns: 10 }),
    );

    const result = scanLogDirectory(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].cost).toBe(1.0);
    expect(result[0].turns).toBe(10);
  });

  it("prefers .raw.json over .json when both exist", () => {
    fs.writeFileSync(
      path.join(tmpDir, "coder-iter-1.raw.json"),
      JSON.stringify({ total_cost_usd: 2.0, num_turns: 20 }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "coder-iter-1.json"),
      JSON.stringify({ total_cost_usd: 1.0, num_turns: 10 }),
    );

    const result = scanLogDirectory(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].cost).toBe(2.0);
    expect(result[0].turns).toBe(20);
  });
});

describe("scanRunDirectories", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-run-dirs-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for nonexistent directory", () => {
    const result = scanRunDirectories(path.join(tmpDir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns empty array for empty directory", () => {
    const result = scanRunDirectories(tmpDir);
    expect(result).toEqual([]);
  });

  it("ignores non-timestamped directories", () => {
    fs.mkdirSync(path.join(tmpDir, "random-dir"));
    fs.mkdirSync(path.join(tmpDir, "not-a-timestamp"));

    const result = scanRunDirectories(tmpDir);
    expect(result).toEqual([]);
  });

  it("scans timestamped run directories sorted newest first", () => {
    // Create two run directories
    const run1Dir = path.join(tmpDir, "2026-03-26-143022");
    const run2Dir = path.join(tmpDir, "2026-03-26-151500");
    fs.mkdirSync(run1Dir);
    fs.mkdirSync(run2Dir);

    // Populate run1
    fs.writeFileSync(
      path.join(run1Dir, "coder-iter-1.raw.json"),
      JSON.stringify({ total_cost_usd: 0.5, num_turns: 8 }),
    );
    fs.writeFileSync(
      path.join(run1Dir, "loop.log"),
      `[2026-03-26 14:30:22] Starting loop
Task file: task-a.md
Iterations: 1/5
Stop reason: smart_stop
Cumulative cost: $0.50
Elapsed time: 60s`,
    );

    // Populate run2
    fs.writeFileSync(
      path.join(run2Dir, "coder-iter-1.raw.json"),
      JSON.stringify({ total_cost_usd: 1.0, num_turns: 12 }),
    );
    fs.writeFileSync(
      path.join(run2Dir, "coder-iter-2.raw.json"),
      JSON.stringify({ total_cost_usd: 0.8, num_turns: 10 }),
    );
    fs.writeFileSync(path.join(run2Dir, "review-iter-1.txt"), "[HIGH] Issue");
    fs.writeFileSync(path.join(run2Dir, "review-iter-2.txt"), "LGTM");
    fs.writeFileSync(
      path.join(run2Dir, "loop.log"),
      `[2026-03-26 15:15:00] Starting loop
Task file: task-b.md
Iterations: 2/10
Stop reason: smart_stop
Cumulative cost: $1.80
Elapsed time: 120s`,
    );

    const result = scanRunDirectories(tmpDir);

    // Newest first
    expect(result).toHaveLength(2);
    expect(result[0].runId).toBe("2026-03-26-151500");
    expect(result[0].taskFile).toBe("task-b.md");
    expect(result[0].iterationsCompleted).toBe(2);
    expect(result[0].totalCost).toBe(1.8);

    expect(result[1].runId).toBe("2026-03-26-143022");
    expect(result[1].taskFile).toBe("task-a.md");
    expect(result[1].iterationsCompleted).toBe(1);
    expect(result[1].totalCost).toBe(0.5);
  });

  it("handles run directories without loop.log", () => {
    const runDir = path.join(tmpDir, "2026-03-26-100000");
    fs.mkdirSync(runDir);
    fs.writeFileSync(
      path.join(runDir, "coder-iter-1.raw.json"),
      JSON.stringify({ total_cost_usd: 0.3, num_turns: 5 }),
    );

    const result = scanRunDirectories(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].runId).toBe("2026-03-26-100000");
    expect(result[0].iterationsCompleted).toBe(1);
    expect(result[0].taskFile).toBeNull();
    expect(result[0].totalCost).toBe(0.3);
  });
});
