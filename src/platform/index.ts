import { chmod, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { spawn } from "node:child_process";
import * as linux from "./linux.js";
import * as macos from "./macos.js";
import * as windows from "./windows.js";

export type PlatformName = "linux" | "macos" | "windows";

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface TsunderePaths {
  root: string;
  config: string;
  cache: string;
  store: string;
  logs: string;
}

export interface RuntimeCheck {
  name: string;
  available: boolean;
  command: string;
}

export function currentPlatform(platform = process.platform): PlatformName {
  if (platform === "win32") {
    return "windows";
  }
  if (platform === "darwin") {
    return "macos";
  }
  return "linux";
}

export function platformLabel(platform = currentPlatform()): string {
  switch (platform) {
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
  }
}

export function platformExecutable(command: string, platform = currentPlatform()): string {
  return adapter(platform).executable(command);
}

export function commandLookup(command: string, platform = currentPlatform()): CommandSpec {
  return adapter(platform).commandLookup(command);
}

export function openFileCommand(path: string, platform = currentPlatform()): CommandSpec {
  return adapter(platform).openFile(path);
}

export function tsunderePaths(home = homedir(), platform = currentPlatform()): TsunderePaths {
  return adapter(platform).tsunderePaths(home);
}

export function defaultStorePath(home = homedir(), platform = currentPlatform()): string {
  return tsunderePaths(home, platform).store;
}

export function expandHomePath(value: string, cwd = process.cwd(), home = homedir(), platform = currentPlatform()): string {
  const path = pathApi(platform);
  const expanded = value === "~" || value.startsWith("~/") || value.startsWith("~\\")
    ? path.join(home, value.slice(2))
    : value;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(cwd, expanded);
}

export async function ensureTsunderePaths(paths = tsunderePaths()): Promise<void> {
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.cache, { recursive: true });
  await mkdir(paths.store, { recursive: true });
  await mkdir(paths.logs, { recursive: true });
  if (!existsSync(paths.config)) {
    await writeFile(paths.config, "{}\n", "utf8");
  }
}

export async function ensureExecutable(path: string, platform = currentPlatform()): Promise<void> {
  if (platform === "windows") {
    return;
  }
  try {
    await chmod(path, 0o755);
  } catch (error) {
    throw permissionError(path, error, platform);
  }
}

export function permissionError(path: string, error: unknown, platform = currentPlatform()): Error {
  const detail = error instanceof Error ? error.message : String(error);
  const hint = platform === "linux"
    ? "On Linux, check file ownership or run chmod +x on the script."
    : "Check file ownership and execute permissions.";
  return new Error(`Permission denied for ${path}. ${hint} ${detail}`);
}

export async function commandExists(command: string, platform = currentPlatform()): Promise<boolean> {
  const spec = commandLookup(command, platform);
  return (await runCommand(spec.command, spec.args, { quiet: true, platform })) === 0;
}

export async function runtimeChecks(platform = currentPlatform()): Promise<RuntimeCheck[]> {
  const checks = [
    { name: "node", command: "node" },
    { name: "npm", command: "npm" }
  ];
  const results: RuntimeCheck[] = [];
  for (const check of checks) {
    results.push({
      name: check.name,
      command: platformExecutable(check.command, platform),
      available: await commandExists(check.command, platform)
    });
  }
  return results;
}

export async function runCommand(command: string, args: string[], options: { quiet?: boolean; cwd?: string; platform?: PlatformName } = {}): Promise<number> {
  const platform = options.platform ?? currentPlatform();
  const invocation = commandInvocation(command, args, platform);
  return new Promise((resolveCode) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: options.quiet ? "ignore" : "inherit",
      shell: false
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EACCES") {
        console.error(permissionError(invocation.command, error, platform).message);
      }
      resolveCode(1);
    });
    child.on("close", (code) => resolveCode(code ?? 1));
  });
}

export function commandInvocation(command: string, args: string[], platform = currentPlatform()): CommandSpec {
  if (platform === "windows" && command.endsWith(".cmd")) {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", command, ...args] };
  }
  return { command, args };
}

function adapter(platform: PlatformName): typeof linux | typeof macos | typeof windows {
  switch (platform) {
    case "windows":
      return windows;
    case "macos":
      return macos;
    case "linux":
      return linux;
  }
}

function pathApi(platform: PlatformName): typeof posix | typeof win32 {
  return platform === "windows" ? win32 : posix;
}
