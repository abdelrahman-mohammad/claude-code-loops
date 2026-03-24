import {
  parseFrontmatter,
  replaceFrontmatterField,
  buildSyncedContent,
} from "../../src/utils/sync-agent-frontmatter.js";

describe("sync-agent-frontmatter", () => {
  const sampleAgent = `---
name: coder
description: "Implements features"
tools:
  - Read
  - Write
model: sonnet
maxTurns: 20
permissionMode: acceptEdits
---

You are a coding agent.`;

  describe("parseFrontmatter", () => {
    it("extracts frontmatter fields", () => {
      const result = parseFrontmatter(sampleAgent);
      expect(result.fields.model).toBe("sonnet");
      expect(result.fields.maxTurns).toBe("20");
      expect(result.fields.permissionMode).toBe("acceptEdits");
    });

    it("preserves body", () => {
      const result = parseFrontmatter(sampleAgent);
      expect(result.body).toContain("You are a coding agent.");
    });

    it("returns empty fields for file without frontmatter", () => {
      const result = parseFrontmatter("Just a markdown file.");
      expect(result.fields).toEqual({});
    });
  });

  describe("replaceFrontmatterField", () => {
    it("replaces model value", () => {
      const result = replaceFrontmatterField(sampleAgent, "model", "opus");
      expect(result).toContain("model: opus");
      expect(result).not.toContain("model: sonnet");
    });

    it("replaces maxTurns value", () => {
      const result = replaceFrontmatterField(sampleAgent, "maxTurns", "30");
      expect(result).toContain("maxTurns: 30");
    });

    it("returns unchanged content when field not present", () => {
      const noPermission = `---
name: coder
model: sonnet
---

Body.`;
      const result = replaceFrontmatterField(
        noPermission,
        "permissionMode",
        "bypassPermissions",
      );
      expect(result).toBe(noPermission);
    });

    it("preserves other fields and formatting", () => {
      const result = replaceFrontmatterField(sampleAgent, "model", "opus");
      expect(result).toContain("name: coder");
      expect(result).toContain("tools:");
      expect(result).toContain("  - Read");
      expect(result).toContain("You are a coding agent.");
    });

    it("does not replace field-like text in markdown body", () => {
      const agentWithBodyMatch = `---
name: coder
model: sonnet
---

Use model: sonnet for all tasks. Set maxTurns: 10 in config.`;
      const result = replaceFrontmatterField(
        agentWithBodyMatch,
        "model",
        "opus",
      );
      expect(result).toContain("model: opus");
      // Body text must remain unchanged
      expect(result).toContain("Use model: sonnet for all tasks.");
    });

    it("handles Windows line endings", () => {
      const windowsAgent =
        "---\r\nname: coder\r\nmodel: sonnet\r\n---\r\n\r\nBody.";
      const result = replaceFrontmatterField(windowsAgent, "model", "opus");
      expect(result).toContain("model: opus");
      expect(result).not.toContain("model: sonnet");
    });
  });

  describe("buildSyncedContent", () => {
    it("applies multiple field changes", () => {
      const result = buildSyncedContent(sampleAgent, {
        model: "opus",
        maxTurns: 30,
        permissionMode: "bypassPermissions",
      });
      expect(result).toContain("model: opus");
      expect(result).toContain("maxTurns: 30");
      expect(result).toContain("permissionMode: bypassPermissions");
    });

    it("skips fields not present in original", () => {
      const minimal = `---
name: reviewer
model: sonnet
---

Review agent.`;
      const result = buildSyncedContent(minimal, {
        model: "opus",
        maxTurns: 15,
        permissionMode: "acceptEdits",
      });
      expect(result).toContain("model: opus");
      expect(result).not.toContain("maxTurns");
      expect(result).not.toContain("permissionMode");
    });
  });
});
