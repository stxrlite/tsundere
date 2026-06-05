import { rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDiscordBuilders, createDiscordDocs, createDiscordEvents, createDiscordImports, createTypeNarrowingMetadata, discordDiagnosticDocs } from "./discord.js";
import { createTypeCacheKey, extractDiscordTypeGraph, findTypeSources } from "./extractor.js";
import { mapGraphToYuriTypes } from "./mapper.js";
import type { TypeGraph, YuriTypeMetadata } from "./graph.js";

export interface TypeSyncResult {
  cacheDir: string;
  cacheKey: string;
  graph: TypeGraph;
  types: YuriTypeMetadata;
  files: string[];
}

export async function syncDiscordTypes(cwd = process.cwd()): Promise<TypeSyncResult> {
  const cacheDir = resolve(cwd, ".yuri-cache");
  await mkdir(cacheDir, { recursive: true });
  const graph = await extractDiscordTypeGraph({ cwd });
  const cacheKey = await createTypeCacheKey(cwd, graph);
  const types = mapGraphToYuriTypes(graph, cacheKey);
  const files = [
    await writeJson(cacheDir, "discord.graph.json", graph),
    await writeJson(cacheDir, "discord.types.json", types),
    await writeJson(cacheDir, "discord.events.json", createDiscordEvents()),
    await writeJson(cacheDir, "discord.builders.json", createDiscordBuilders(graph)),
    await writeJson(cacheDir, "discord.components.json", { generatedAt: new Date().toISOString(), components: [] }),
    await writeJson(cacheDir, "discord.schemas.json", { generatedAt: new Date().toISOString(), schemas: [] }),
    await writeJson(cacheDir, "discord.routes.json", { generatedAt: new Date().toISOString(), routes: [] }),
    await writeJson(cacheDir, "discord.imports.json", createDiscordImports(graph)),
    await writeJson(cacheDir, "discord.docs.json", {
      ...createDiscordDocs(graph),
      diagnostics: discordDiagnosticDocs(),
      narrowing: createTypeNarrowingMetadata()
    }),
    await writeJson(cacheDir, "discord.cache.json", {
      generatedAt: new Date().toISOString(),
      cacheKey,
      sources: graph.sources
    })
  ];
  return { cacheDir, cacheKey, graph, types, files };
}

export async function cleanDiscordTypes(cwd = process.cwd()): Promise<void> {
  await rm(resolve(cwd, ".yuri-cache"), { recursive: true, force: true });
}

export async function inspectDiscordType(symbol: string, cwd = process.cwd()): Promise<YuriTypeMetadata["types"][number] | undefined> {
  const file = resolve(cwd, ".yuri-cache", "discord.types.json");
  if (!existsSync(file)) {
    return undefined;
  }
  const metadata = JSON.parse(await readFile(file, "utf8")) as YuriTypeMetadata;
  return metadata.types.find((type) => type.name === symbol);
}

export async function doctorDiscordTypes(cwd = process.cwd()): Promise<{ ok: boolean; messages: string[] }> {
  const messages: string[] = [];
  const sources = await findTypeSources(cwd);
  if (sources.length === 0) {
    messages.push("No installed Discord type packages found. Run `tsundere add @tsundere/discord discord.js` if this is a Discord project.");
  } else {
    messages.push(`Found Discord type sources: ${sources.map((source) => `${source.packageName}@${source.version}`).join(", ")}`);
  }
  const cacheFile = resolve(cwd, ".yuri-cache", "discord.cache.json");
  messages.push(existsSync(cacheFile) ? "Discord type cache exists." : "Discord type cache is missing. Run `tsundere types sync`.");
  return { ok: sources.length > 0 && existsSync(cacheFile), messages };
}

async function writeJson(cacheDir: string, filename: string, value: unknown): Promise<string> {
  const file = resolve(cacheDir, filename);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}
