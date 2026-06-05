import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "dist", "discord");
const target = resolve(root, "packages", "discord", "dist");

if (existsSync(source)) {
  await rm(target, { recursive: true, force: true });
  await mkdir(resolve(root, "packages", "discord"), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}
