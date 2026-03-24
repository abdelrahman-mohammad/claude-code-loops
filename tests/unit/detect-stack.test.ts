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

  it("detects 'spring-boot' when build.gradle.kts exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(path.join(tmpDir, "build.gradle.kts"), "");
    expect(detectStack(tmpDir)).toBe("spring-boot");
  });

  it("returns 'generic' when no marker files exist", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    expect(detectStack(tmpDir)).toBe("generic");
  });

  it("node detection takes priority (package.json checked first)", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-stack-"));
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tmpDir, "pom.xml"), "<project/>");
    expect(detectStack(tmpDir)).toBe("node");
  });
});
