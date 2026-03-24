import { installBase } from "./base.js";
import { installNode } from "./node.js";
import { installSpringBoot } from "./spring-boot.js";
import { installGeneric } from "./generic.js";
import type { CopyOptions } from "../utils/copy.js";

export type StackName = "node" | "spring-boot" | "generic";

export type Installer = (
  destDir: string,
  options: CopyOptions,
) => Promise<string[]>;

export const installerMap: Record<StackName, Installer> = {
  node: installNode,
  "spring-boot": installSpringBoot,
  generic: installGeneric,
};

export const stackLabels: Record<StackName, string> = {
  node: "Node.js / TypeScript",
  "spring-boot": "Java / Spring Boot",
  generic: "Generic",
};

export { installBase };
