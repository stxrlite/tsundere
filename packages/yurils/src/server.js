#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const command = process.argv[2] ?? "stdio";

if (command === "discord-metadata") {
  const metadata = await readFile(resolve(import.meta.dirname, "..", "data", "discord-intellisense.json"), "utf8");
  process.stdout.write(metadata);
} else {
  console.log("YuriLS language server scaffold. Use `yurils discord-metadata` to inspect Discord IntelliSense data.");
}
