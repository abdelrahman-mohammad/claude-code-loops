import path from "node:path";
import { copyTemplateDir, TEMPLATES_DIR, type CopyOptions } from "../utils/copy.js";

export async function installFastapi(
  destDir: string,
  options: CopyOptions,
): Promise<string[]> {
  const srcDir = path.join(TEMPLATES_DIR, "fastapi");
  return copyTemplateDir(srcDir, destDir, options);
}
