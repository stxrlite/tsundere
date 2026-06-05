import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

await rm(resolve(root, "dist"), { recursive: true, force: true });

for await (const entry of await import("node:fs/promises").then((fs) => fs.readdir(root))) {
  if (entry.endsWith(".vsix")) {
    await rm(resolve(root, entry), { force: true });
  }
}
