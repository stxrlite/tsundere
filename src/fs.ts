import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function walk(root: string, extension: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return walk(path, extension);
    }
    return entry.isFile() && path.endsWith(extension) ? [path] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}
