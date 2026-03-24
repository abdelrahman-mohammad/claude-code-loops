import { describe, it, expect } from "vitest";
import { replaceTemplateVars } from "../../src/utils/template-vars.js";

describe("replaceTemplateVars", () => {
  it("replaces {{projectName}} correctly", () => {
    const result = replaceTemplateVars("Hello {{projectName}}", {
      projectName: "my-app",
    });
    expect(result).toBe("Hello my-app");
  });

  it("handles multiple occurrences in one string", () => {
    const result = replaceTemplateVars(
      "{{projectName}} is called {{projectName}}",
      { projectName: "my-app" },
    );
    expect(result).toBe("my-app is called my-app");
  });

  it("returns unchanged string when no vars match", () => {
    const result = replaceTemplateVars("Hello {{unknown}}", {
      projectName: "my-app",
    });
    expect(result).toBe("Hello {{unknown}}");
  });

  it("handles empty vars object", () => {
    const result = replaceTemplateVars("Hello {{projectName}}", {});
    expect(result).toBe("Hello {{projectName}}");
  });

  it("does not replace partial matches like {projectName} (single brace)", () => {
    const result = replaceTemplateVars("{projectName}", {
      projectName: "my-app",
    });
    expect(result).toBe("{projectName}");
  });

  it("handles multiple different variables", () => {
    const result = replaceTemplateVars(
      "{{greeting}} {{name}}, welcome to {{place}}",
      { greeting: "Hello", name: "Alice", place: "Wonderland" },
    );
    expect(result).toBe("Hello Alice, welcome to Wonderland");
  });
});
