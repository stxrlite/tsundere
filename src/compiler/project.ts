import { existsSync, readFileSync, watch } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ProtectProfile, TsundereConfig } from "../types.js";
import { compileYuri } from "./transpile.js";
import { formatDiagnostic } from "./diagnostics.js";
import { walk } from "../fs.js";
import { protectJavaScript } from "./protect.js";

interface BuildOptions {
  emitRuntime?: boolean;
  protect?: {
    profile: ProtectProfile;
    seed?: string | undefined;
  } | undefined;
}

export async function buildProject(config: TsundereConfig, cwd = process.cwd(), options: BuildOptions = {}): Promise<number> {
  const sourceRoot = resolve(cwd, config.source);
  const outRoot = resolve(cwd, config.outDir);
  const files = await walk(sourceRoot, ".yuri");
  const diagnosticOptions = diagnosticFormatOptions(config);
  let errors = 0;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relativePath = relative(sourceRoot, file);
    const outputExt = config.target === "typescript" ? ".ts" : ".js";
    const outputFile = join(outRoot, relativePath.replace(/\.yuri$/u, outputExt));
    const result = compileYuri({
      filename: relativePath,
      source,
      target: config.target,
      sourceMaps: config.sourceMaps,
      strict: config.strict
    });

    for (const diagnostic of result.diagnostics) {
      if (shouldSkipDiagnostic(diagnostic, config)) {
        continue;
      }
      console.error(formatDiagnostic(diagnostic, diagnosticOptions));
      if (diagnostic.severity === "error") {
        errors += 1;
      }
    }

    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, result.code, "utf8");
    if (result.map) {
      await writeFile(`${outputFile}.map`, result.map, "utf8");
    }
  }

  if (files.length === 0) {
    console.warn(`No .yuri files found in ${sourceRoot}`);
  }

  if (errors > 0) {
    return 1;
  }
  if (options.emitRuntime ?? true) {
    await refreshBundledDiscordRuntime(cwd);
    await emitNodeRuntime(config, cwd, options);
  }
  return 0;
}

export async function startProject(config: TsundereConfig, cwd = process.cwd()): Promise<number> {
  const buildCode = await buildProject(config, cwd);
  if (buildCode !== 0) {
    return buildCode;
  }
  return runBuiltProject(config, cwd);
}

export async function devProject(config: TsundereConfig, cwd = process.cwd()): Promise<number> {
  let child: ChildProcess | undefined;
  let building = false;
  let pending = false;
  let timer: NodeJS.Timeout | undefined;

  const rebuild = async (): Promise<void> => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    pending = false;
    if (child) {
      child.kill();
      child = undefined;
    }
    const code = await buildProject(config, cwd);
    if (code === 0) {
      child = spawnNode(runtimeEntry(config, cwd), cwd);
      child.on("exit", (exitCode, signal) => {
        if (signal !== "SIGTERM" && signal !== "SIGKILL" && exitCode && exitCode !== 0) {
          console.error(`Tsundere runtime exited with code ${exitCode}. Waiting for changes...`);
        }
      });
    }
    building = false;
    if (pending) {
      await rebuild();
    }
  };

  await rebuild();
  const sourceRoot = resolve(cwd, config.source);
  console.log(`Tsundere dev is watching ${sourceRoot}`);

  const scheduleRebuild = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void rebuild();
    }, 100);
  };

  let snapshot = await sourceSnapshot(sourceRoot);
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(sourceRoot, { recursive: true }, (_event, filename) => {
      if (!filename || !filename.endsWith(".yuri")) {
        return;
      }
      void sourceSnapshot(sourceRoot).then((next) => {
        snapshot = next;
      });
      scheduleRebuild();
    });
  } catch {
    watcher = undefined;
  }
  const poller = setInterval(() => {
    void sourceSnapshot(sourceRoot).then((next) => {
      if (!sameSnapshot(snapshot, next)) {
        snapshot = next;
        scheduleRebuild();
      }
    });
  }, 750);
  const keepAlive = setInterval(() => undefined, 2147483647);

  const stop = (): void => {
    clearInterval(keepAlive);
    clearInterval(poller);
    watcher?.close();
    if (child) {
      child.kill();
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await new Promise<void>(() => undefined);
  return 0;
}

export async function runBuiltProject(config: TsundereConfig, cwd = process.cwd()): Promise<number> {
  const entry = runtimeEntry(config, cwd);
  if (!existsSync(entry)) {
    const code = await buildProject(config, cwd);
    if (code !== 0) {
      return code;
    }
  }
  return waitForProcess(spawnNode(entry, cwd));
}

async function emitNodeRuntime(config: TsundereConfig, cwd: string, options: BuildOptions = {}): Promise<void> {
  const outRoot = resolve(cwd, config.outDir);
  const runtimeRoot = resolve(cwd, ".tsundere", "runtime-build");
  const files = await walk(outRoot, config.target === "typescript" ? ".ts" : ".js");
  await rm(runtimeRoot, { recursive: true, force: true });
  const protectedBuilds: Array<{ file: string; buildId: string; profile: ProtectProfile }> = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relativePath = relative(outRoot, file);
    const outputFile = join(runtimeRoot, relativePath.replace(/\.(ts|js)$/u, ".js"));
    let output = config.target === "typescript"
      ? ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
          sourceMap: config.sourceMaps,
          inlineSources: true,
          esModuleInterop: true
        },
        fileName: file
      }).outputText
      : source;
    output = addNodeImportExtensions(output);
    if (options.protect) {
      const result = protectJavaScript(output, options.protect);
      output = result.code;
      protectedBuilds.push({ file: relativePath.replace(/\.(ts|js)$/u, ".js"), buildId: result.buildId, profile: options.protect.profile });
    }
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, output, "utf8");
  }
  if (options.protect) {
    await writeFile(resolve(runtimeRoot, "tsundere-protect.json"), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      profile: options.protect.profile,
      seed: options.protect.seed ?? "auto",
      files: protectedBuilds
    }, null, 2)}\n`, "utf8");
    const ids = protectedBuilds.map((build) => build.buildId).join(", ");
    console.log(`Tsundere Protect ${options.protect.profile}: ${ids || "no runtime files"}`);
  }
}

async function refreshBundledDiscordRuntime(cwd: string): Promise<void> {
  const cliDistRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceDist = resolve(cliDistRoot, "discord");
  if (!existsSync(sourceDist)) {
    return;
  }
  const targetRoot = resolve(cwd, ".tsundere", "runtime", "discord");
  const targetDist = resolve(targetRoot, "dist");
  await rm(targetDist, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });
  await cp(sourceDist, targetDist, { recursive: true, force: true });
  await writeFile(resolve(targetRoot, "package.json"), `${JSON.stringify({
    name: "@tsundere/discord",
    version: "0.1.1",
    type: "module",
    exports: { ".": "./dist/index.js" },
    types: "./dist/index.d.ts",
    dependencies: {
      "discord.js": "^14.26.4"
    }
  }, null, 2)}\n`, "utf8");
}

async function sourceSnapshot(sourceRoot: string): Promise<Map<string, number>> {
  const files = await walk(sourceRoot, ".yuri");
  const snapshot = new Map<string, number>();
  await Promise.all(files.map(async (file) => {
    const info = await stat(file);
    snapshot.set(file, info.mtimeMs);
  }));
  return snapshot;
}

function sameSnapshot(left: Map<string, number>, right: Map<string, number>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [file, mtime] of left) {
    if (right.get(file) !== mtime) {
      return false;
    }
  }
  return true;
}

function shouldSkipDiagnostic(diagnostic: { code: string; severity: "error" | "warning" }, config: TsundereConfig): boolean {
  const disabled = new Set(config.diagnostics?.disabled ?? []);
  if (disabled.has(diagnostic.code)) {
    return true;
  }
  return diagnostic.severity === "warning" && config.diagnostics?.warnings === false;
}

function diagnosticFormatOptions(config: TsundereConfig): { color: boolean; verbose: boolean } {
  const color = config.diagnostics?.color ?? (Boolean(process.stderr.isTTY) && !process.env.NO_COLOR);
  return {
    color,
    verbose: config.diagnostics?.verbose ?? false
  };
}

function addNodeImportExtensions(source: string): string {
  return source
    .replace(/(\bfrom\s*["'])(\.{1,2}\/[^"']+)(["'])/gu, (_match, prefix: string, specifier: string, suffix: string) => `${prefix}${withJsExtension(specifier)}${suffix}`)
    .replace(/(\bimport\s*["'])(\.{1,2}\/[^"']+)(["'])/gu, (_match, prefix: string, specifier: string, suffix: string) => `${prefix}${withJsExtension(specifier)}${suffix}`)
    .replace(/(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/gu, (_match, prefix: string, specifier: string, suffix: string) => `${prefix}${withJsExtension(specifier)}${suffix}`);
}

function withJsExtension(specifier: string): string {
  const hashIndex = specifier.indexOf("#");
  const beforeHash = hashIndex >= 0 ? specifier.slice(0, hashIndex) : specifier;
  const hash = hashIndex >= 0 ? specifier.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  const pathOnly = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";
  if (/\.(?:cjs|mjs|js|json|node)$/iu.test(pathOnly)) {
    return specifier;
  }
  return `${pathOnly}.js${query}${hash}`;
}

function runtimeEntry(config: TsundereConfig, cwd: string): string {
  return resolve(cwd, ".tsundere", "runtime-build", "main.js");
}

function spawnNode(entry: string, cwd: string): ChildProcess {
  const child = spawn(process.execPath, [entry], {
    cwd,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, ...readDotEnv(cwd) }
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(rewriteRuntimeBranding(chunk.toString()));
  });
  return child;
}

function waitForProcess(child: ChildProcess): Promise<number> {
  return new Promise((resolveCode) => {
    child.on("error", () => resolveCode(1));
    child.on("close", (code) => resolveCode(code ?? 0));
  });
}

function readDotEnv(cwd: string): Record<string, string> {
  const file = resolve(cwd, ".env");
  if (!existsSync(file)) {
    return {};
  }
  const raw = readFileSync(file, "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index < 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/gu, "");
    env[key] = value;
  }
  return env;
}

function rewriteRuntimeBranding(output: string): string {
  return output.replace(/\bNode\.js (v\d+\.\d+\.\d+)\b/gu, (_match, nodeVersion: string) => {
    return `Tsundere Runtime ${runtimeVersion()} (${nodeVersion})`;
  });
}

function runtimeVersion(): string {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  if (!existsSync(packagePath)) {
    return "0.0.0";
  }
  try {
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
    return manifest.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
