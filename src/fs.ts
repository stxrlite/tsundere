import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function walk(root: string, extension: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path, extension));
    } else if (entry.isFile() && path.endsWith(extension)) {
      files.push(path);
    }
  }
  return files;
}
