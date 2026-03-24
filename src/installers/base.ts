import path from "node:path";
import {
  copyTemplateDir,
  TEMPLATES_DIR,
  type CopyOptions,
} from "../utils/copy.js";

export async function installBase(
  destDir: string,
  options: CopyOptions,
): Promise<string[]> {
  const srcDir = path.join(TEMPLATES_DIR, "base");
  return copyTemplateDir(srcDir, destDir, options);
}
