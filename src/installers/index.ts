import { installBase } from "./base.js";
import { installNode } from "./node.js";
import { installSpringBoot } from "./spring-boot.js";
import { installFastapi } from "./fastapi.js";
import { installDjango } from "./django.js";
import { installNextjs } from "./nextjs.js";
import { installGeneric } from "./generic.js";
import type { CopyOptions } from "../utils/copy.js";

export type StackName =
  | "node"
  | "spring-boot"
  | "fastapi"
  | "django"
  | "nextjs"
  | "generic";

export type Installer = (
  destDir: string,
  options: CopyOptions,
) => Promise<string[]>;

export const installerMap: Record<StackName, Installer> = {
  node: installNode,
  "spring-boot": installSpringBoot,
  fastapi: installFastapi,
  django: installDjango,
  nextjs: installNextjs,
  generic: installGeneric,
};

export const stackLabels: Record<StackName, string> = {
  node: "Node.js / TypeScript",
  "spring-boot": "Java / Spring Boot",
  fastapi: "Python / FastAPI",
  django: "Python / Django",
  nextjs: "Next.js",
  generic: "Generic",
};

export { installBase };
