import fs from "node:fs";
import path from "node:path";
import type { StackName } from "../installers/index.js";

/**
 * Auto-detect project stack from marker files.
 */
export function detectStack(cwd: string): StackName {
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return "node";
  }
  if (
    fs.existsSync(path.join(cwd, "pom.xml")) ||
    fs.existsSync(path.join(cwd, "build.gradle")) ||
    fs.existsSync(path.join(cwd, "build.gradle.kts"))
  ) {
    return "spring-boot";
  }
  return "generic";
}
