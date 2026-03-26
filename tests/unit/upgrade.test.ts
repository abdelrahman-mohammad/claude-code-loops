import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeUpgradeDiff } from "../../src/commands/upgrade.js";

describe("computeUpgradeDiff", () => {
  let tmpDir: string;
  let templateDir: string;
  let destDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-upgrade-test-"));
    templateDir = path.join(tmpDir, "templates");
    destDir = path.join(tmpDir, "dest");
    fs.mkdirSync(templateDir, { recursive: true });
    fs.mkdirSync(destDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("marks new files as new", () => {
    fs.writeFileSync(path.join(templateDir, "new-file.md"), "content");
    const diffs = computeUpgradeDiff(["new-file.md"], templateDir, destDir);
    expect(diffs).toEqual([{ relativePath: "new-file.md", status: "new" }]);
  });

  it("marks identical files as unchanged", () => {
    fs.writeFileSync(path.join(templateDir, "file.md"), "same content");
    fs.writeFileSync(path.join(destDir, "file.md"), "same content");
    const diffs = computeUpgradeDiff(["file.md"], templateDir, destDir);
    expect(diffs).toEqual([{ relativePath: "file.md", status: "unchanged" }]);
  });

  it("marks different files as modified", () => {
    fs.writeFileSync(path.join(templateDir, "file.md"), "new content");
    fs.writeFileSync(path.join(destDir, "file.md"), "old content");
    const diffs = computeUpgradeDiff(["file.md"], templateDir, destDir);
    expect(diffs).toEqual([{ relativePath: "file.md", status: "modified" }]);
  });

  it("handles multiple files with mixed statuses", () => {
    fs.writeFileSync(path.join(templateDir, "new.md"), "content");
    fs.writeFileSync(path.join(templateDir, "same.md"), "identical");
    fs.writeFileSync(path.join(destDir, "same.md"), "identical");
    fs.writeFileSync(path.join(templateDir, "changed.md"), "v2");
    fs.writeFileSync(path.join(destDir, "changed.md"), "v1");

    const diffs = computeUpgradeDiff(
      ["new.md", "same.md", "changed.md"],
      templateDir,
      destDir,
    );

    expect(diffs).toEqual([
      { relativePath: "new.md", status: "new" },
      { relativePath: "same.md", status: "unchanged" },
      { relativePath: "changed.md", status: "modified" },
    ]);
  });

  it("returns empty array for empty file list", () => {
    const diffs = computeUpgradeDiff([], templateDir, destDir);
    expect(diffs).toEqual([]);
  });

  it("handles files in subdirectories", () => {
    const subDir = path.join(templateDir, "sub");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, "nested.md"), "content");

    const diffs = computeUpgradeDiff(["sub/nested.md"], templateDir, destDir);
    expect(diffs).toEqual([{ relativePath: "sub/nested.md", status: "new" }]);
  });

  it("detects whitespace-only differences as modified", () => {
    fs.writeFileSync(path.join(templateDir, "file.md"), "content\n");
    fs.writeFileSync(path.join(destDir, "file.md"), "content");
    const diffs = computeUpgradeDiff(["file.md"], templateDir, destDir);
    expect(diffs).toEqual([{ relativePath: "file.md", status: "modified" }]);
  });
});
