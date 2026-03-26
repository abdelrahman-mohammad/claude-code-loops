import {
  parseCoderJson,
  parseReviewTxt,
  parseLoopLog,
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
