import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TsundereConfig } from "./types.js";

const defaults: TsundereConfig = {
  name: "tsundere-app",
  source: "src",
  outDir: "build",
  target: "typescript",
  strict: true,
  sourceMaps: true,
  runtime: "node",
  plugins: []
};

export async function loadConfig(cwd = process.cwd(), environment = process.env.TSUNDERE_ENV): Promise<TsundereConfig> {
  const layers = [
    "tsundere.config.json",
    environment ? `tsundere.${environment}.config.json` : undefined
  ].filter((value): value is string => Boolean(value));

  let config: TsundereConfig = { ...defaults };
  let loaded = false;
  for (const layer of layers) {
    const configPath = resolve(cwd, layer);
    if (!existsSync(configPath)) {
      continue;
    }
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<TsundereConfig>;
    config = mergeConfig(config, parsed);
    loaded = true;
  }

  return validateConfig(config, loaded ? "tsundere config" : "defaults");
}

export function validateConfig(config: TsundereConfig, filename = "tsundere.config.json"): TsundereConfig {
  const targets = new Set(["javascript", "typescript"]);
  if (!config.name || typeof config.name !== "string") {
    throw new Error(`${filename}: "name" must be a project name.`);
  }
  if (!config.source || typeof config.source !== "string") {
    throw new Error(`${filename}: "source" must be a directory.`);
  }
  if (!config.outDir || typeof config.outDir !== "string") {
    throw new Error(`${filename}: "outDir" must be a directory.`);
  }
  if (!targets.has(config.target)) {
    throw new Error(`${filename}: "target" must be "javascript" or "typescript".`);
  }
  return config;
}

function mergeConfig(base: TsundereConfig, override: Partial<TsundereConfig>): TsundereConfig {
  const merged: TsundereConfig = {
    ...base,
    ...override,
  };
  if (base.discord || override.discord) {
    merged.discord = { ...base.discord, ...override.discord };
  }
  if (base.enterprise || override.enterprise) {
    merged.enterprise = { ...base.enterprise, ...override.enterprise };
  }
  const plugins = override.plugins ?? base.plugins;
  if (plugins !== undefined) {
    merged.plugins = plugins;
  }
  return merged;
}
