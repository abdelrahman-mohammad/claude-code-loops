import { parseFullFrontmatter } from "../../src/commands/agent.js";

describe("parseFullFrontmatter", () => {
  it("parses scalar fields", () => {
    const content = `---
name: coder
model: sonnet
maxTurns: 30
permissionMode: acceptEdits
---
# Body`;
    const result = parseFullFrontmatter(content);
    expect(result.name).toBe("coder");
    expect(result.model).toBe("sonnet");
    expect(result.maxTurns).toBe(30);
    expect(result.permissionMode).toBe("acceptEdits");
  });

  it("parses array fields", () => {
    const content = `---
name: coder
tools:
  - Read
  - Write
  - Bash
---`;
    const result = parseFullFrontmatter(content);
    expect(result.tools).toEqual(["Read", "Write", "Bash"]);
  });

  it("parses quoted values", () => {
    const content = `---
description: "A helpful agent"
name: 'test-agent'
---`;
    const result = parseFullFrontmatter(content);
    expect(result.description).toBe("A helpful agent");
    expect(result.name).toBe("test-agent");
  });

  it("returns empty object for no frontmatter", () => {
    const content = "# Just a markdown file";
    const result = parseFullFrontmatter(content);
    expect(result).toEqual({});
  });

  it("handles inline array syntax", () => {
    const content = `---
name: coder
tools: [Read, Write, Bash]
---`;
    const result = parseFullFrontmatter(content);
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools).toEqual(["Read", "Write", "Bash"]);
  });

  it("handles empty array syntax", () => {
    const content = `---
name: coder
tools: []
---`;
    const result = parseFullFrontmatter(content);
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools).toEqual([]);
  });

  it("parses numeric string as number", () => {
    const content = `---
maxTurns: 50
---`;
    const result = parseFullFrontmatter(content);
    expect(result.maxTurns).toBe(50);
  });

  it("handles multiple array fields", () => {
    const content = `---
name: coder
tools:
  - Read
  - Write
allowedPaths:
  - src/
  - tests/
---`;
    const result = parseFullFrontmatter(content);
    expect(result.tools).toEqual(["Read", "Write"]);
    expect(result.allowedPaths).toEqual(["src/", "tests/"]);
  });

  it("handles frontmatter with only scalars", () => {
    const content = `---
name: reviewer
model: opus
---`;
    const result = parseFullFrontmatter(content);
    expect(result.name).toBe("reviewer");
    expect(result.model).toBe("opus");
  });

  it("handles array as the last field without trailing content", () => {
    const content = `---
tools:
  - Bash
  - Read
---`;
    const result = parseFullFrontmatter(content);
    expect(result.tools).toEqual(["Bash", "Read"]);
  });
});
