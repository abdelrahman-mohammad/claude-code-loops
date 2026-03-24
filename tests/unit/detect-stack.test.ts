import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { detectStack } from "../../src/utils/detect-stack.js";

describe("detectStack", () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects 'node' when package.json exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    expect(detectStack(tmpDir)).toBe("node");
  });

  it("detects 'nextjs' when next.config.js exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    fs.writeFileSync(
      path.join(tmpDir, "next.config.js"),
      "module.exports = {}",
    );
    expect(detectStack(tmpDir)).toBe("nextjs");
  });

  it("detects 'nextjs' when package.json contains next", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0" } }),
    );
    expect(detectStack(tmpDir)).toBe("nextjs");
  });

  it("detects 'django' when manage.py contains django", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(
      path.join(tmpDir, "manage.py"),
      "#!/usr/bin/env python\nimport django\ndjango.setup()",
    );
    expect(detectStack(tmpDir)).toBe("django");
  });

  it("detects 'django' when pyproject.toml contains django", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\ndependencies = ["Django>=5.0"]',
    );
    expect(detectStack(tmpDir)).toBe("django");
  });

  it("detects 'fastapi' when pyproject.toml contains fastapi", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\ndependencies = ["fastapi>=0.100"]',
    );
    expect(detectStack(tmpDir)).toBe("fastapi");
  });

  it("detects 'fastapi' when requirements.txt contains fastapi", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(
      path.join(tmpDir, "requirements.txt"),
      "fastapi>=0.100\nuvicorn\n",
    );
    expect(detectStack(tmpDir)).toBe("fastapi");
  });

  it("detects 'spring-boot' when pom.xml exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(path.join(tmpDir, "pom.xml"), "<project/>");
    expect(detectStack(tmpDir)).toBe("spring-boot");
  });

  it("detects 'spring-boot' when build.gradle exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(path.join(tmpDir, "build.gradle"), "");
    expect(detectStack(tmpDir)).toBe("spring-boot");
  });

  it("returns 'generic' when no marker files exist", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    expect(detectStack(tmpDir)).toBe("generic");
  });

  it("nextjs takes priority over node (both have package.json)", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(path.join(tmpDir, "next.config.mjs"), "export default {}");
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    expect(detectStack(tmpDir)).toBe("nextjs");
  });

  it("django takes priority over fastapi (both are Python)", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\ndependencies = ["Django>=5.0", "fastapi>=0.100"]',
    );
    expect(detectStack(tmpDir)).toBe("django");
  });
});
