import fs from "node:fs";
import path from "node:path";
import type { StackName } from "../installers/index.js";

/**
 * Read a file and check if it contains a string (case-insensitive).
 */
function fileContains(filePath: string, search: string): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.toLowerCase().includes(search.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Check if any requirements file contains a package name.
 */
function requirementsContain(cwd: string, pkg: string): boolean {
  const candidates = [
    path.join(cwd, "requirements.txt"),
    path.join(cwd, "requirements", "base.txt"),
    path.join(cwd, "requirements", "dev.txt"),
  ];
  return candidates.some((f) => fileContains(f, pkg));
}

/**
 * Auto-detect project stack from marker files.
 * Priority: Next.js > Node > Django > FastAPI > Spring Boot > generic
 */
export function detectStack(cwd: string): StackName {
  // Next.js (check before generic Node — both have package.json)
  if (
    fs.existsSync(path.join(cwd, "next.config.js")) ||
    fs.existsSync(path.join(cwd, "next.config.mjs")) ||
    fs.existsSync(path.join(cwd, "next.config.ts"))
  ) {
    return "nextjs";
  }
  if (
    fs.existsSync(path.join(cwd, "package.json")) &&
    fileContains(path.join(cwd, "package.json"), '"next"')
  ) {
    return "nextjs";
  }

  // Node.js / TypeScript (generic Node — no Next.js markers)
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return "node";
  }

  // Django (check before FastAPI — both are Python)
  if (
    fs.existsSync(path.join(cwd, "manage.py")) &&
    fileContains(path.join(cwd, "manage.py"), "django")
  ) {
    return "django";
  }
  if (fileContains(path.join(cwd, "pyproject.toml"), "django")) {
    return "django";
  }
  if (requirementsContain(cwd, "django")) {
    return "django";
  }

  // FastAPI
  if (fileContains(path.join(cwd, "pyproject.toml"), "fastapi")) {
    return "fastapi";
  }
  if (requirementsContain(cwd, "fastapi")) {
    return "fastapi";
  }

  // Spring Boot / Java
  if (
    fs.existsSync(path.join(cwd, "pom.xml")) ||
    fs.existsSync(path.join(cwd, "build.gradle")) ||
    fs.existsSync(path.join(cwd, "build.gradle.kts"))
  ) {
    return "spring-boot";
  }

  return "generic";
}
