import { describe, it, expect } from "vitest";
import { mergeSettings } from "../../src/utils/merge-settings.js";

describe("mergeSettings", () => {
  it("merges two empty objects", () => {
    const result = mergeSettings({}, {});
    expect(result).toEqual({});
  });

  it("preserves existing hook arrays and appends incoming hooks", () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: ["echo existing"] }],
      },
    };
    const incoming = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: ["echo incoming"] }],
      },
    };
    const result = mergeSettings(existing, incoming);
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.PreToolUse).toContainEqual({
      matcher: "Bash",
      hooks: ["echo existing"],
    });
    expect(hooks.PreToolUse).toContainEqual({
      matcher: "Bash",
      hooks: ["echo incoming"],
    });
  });

  it("does not duplicate identical hooks", () => {
    const hookEntry = { matcher: "Bash", hooks: ["echo hello"] };
    const existing = {
      hooks: { PreToolUse: [hookEntry] },
    };
    const incoming = {
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: ["echo hello"] }] },
    };
    const result = mergeSettings(existing, incoming);
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks.PreToolUse).toHaveLength(1);
  });

  it("deduplicates permission allow/deny rules", () => {
    const existing = {
      permissions: { allow: ["Read", "Write"], deny: ["Delete"] },
    };
    const incoming = {
      permissions: { allow: ["Write", "Execute"], deny: ["Delete", "Admin"] },
    };
    const result = mergeSettings(existing, incoming);
    const perms = result.permissions as Record<string, string[]>;
    expect(perms.allow).toEqual(["Read", "Write", "Execute"]);
    expect(perms.deny).toEqual(["Delete", "Admin"]);
  });

  it("preserves existing scalar values (does not overwrite)", () => {
    const existing = { model: "opus" };
    const incoming = { model: "sonnet" };
    const result = mergeSettings(existing, incoming);
    expect(result.model).toBe("opus");
  });

  it("handles missing hooks key on either side", () => {
    const existingNoHooks = { model: "opus" };
    const incomingWithHooks = {
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: ["echo hi"] }] },
    };
    const result1 = mergeSettings(existingNoHooks, incomingWithHooks);
    const hooks1 = result1.hooks as Record<string, unknown[]>;
    expect(hooks1.PreToolUse).toHaveLength(1);

    const existingWithHooks = {
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: ["echo hi"] }] },
    };
    const incomingNoHooks = { model: "sonnet" };
    const result2 = mergeSettings(existingWithHooks, incomingNoHooks);
    const hooks2 = result2.hooks as Record<string, unknown[]>;
    expect(hooks2.PreToolUse).toHaveLength(1);
  });

  it("deep merges nested objects", () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: ["echo a"] }],
      },
    };
    const incoming = {
      hooks: {
        PostToolUse: [{ matcher: "Write", hooks: ["echo b"] }],
      },
    };
    const result = mergeSettings(existing, incoming);
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PostToolUse).toHaveLength(1);
  });

  it("copies new top-level keys from incoming that don't exist in existing", () => {
    const existing = { model: "opus" };
    const incoming = { theme: "dark", verbose: true };
    const result = mergeSettings(existing, incoming);
    expect(result.model).toBe("opus");
    expect(result.theme).toBe("dark");
    expect(result.verbose).toBe(true);
  });
});
