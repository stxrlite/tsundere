import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, posix, resolve, win32 } from "node:path";
import { tmpdir } from "node:os";
import {
  commandInvocation,
  commandLookup,
  currentPlatform,
  ensureExecutable,
  ensureTsunderePaths,
  expandHomePath,
  permissionError,
  platformExecutable,
  runCommand,
  tsunderePaths
} from "../dist/platform/index.js";

test("detects Linux, macOS, and Windows from Node platform names", () => {
  assert.equal(currentPlatform("linux"), "linux");
  assert.equal(currentPlatform("darwin"), "macos");
  assert.equal(currentPlatform("win32"), "windows");
  assert.equal(currentPlatform("freebsd"), "linux");
});

test("builds Linux-safe Tsundere config and storage paths", () => {
  const paths = tsunderePaths("/home/cloaxy", "linux");
  assert.equal(paths.root, "/home/cloaxy/.tsundere");
  assert.equal(paths.config, "/home/cloaxy/.tsundere/config.json");
  assert.equal(paths.cache, "/home/cloaxy/.tsundere/cache");
  assert.equal(paths.store, "/home/cloaxy/.tsundere/store");
  assert.equal(paths.logs, "/home/cloaxy/.tsundere/logs");
});

test("expands home paths without hardcoded operating system separators", () => {
  assert.equal(expandHomePath("~/.tsundere/store", "/project", "/home/cloaxy", "linux"), "/home/cloaxy/.tsundere/store");
  assert.equal(expandHomePath("./.cache", "/project", "/home/cloaxy", "linux"), "/project/.cache");
  assert.equal(expandHomePath("~\\.tsundere\\store", "C:\\project", "C:\\Users\\Cloaxyyy", "windows"), win32.resolve("C:\\Users\\Cloaxyyy", ".tsundere", "store"));
});

test("creates Tsundere home, config, cache, store, and logs folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsundere-platform-"));
  const paths = tsunderePaths(root, "linux");
  await ensureTsunderePaths(paths);
  assert.equal(existsSync(paths.root), true);
  assert.equal(existsSync(paths.config), true);
  assert.equal(existsSync(paths.cache), true);
  assert.equal(existsSync(paths.store), true);
  assert.equal(existsSync(paths.logs), true);
  assert.equal(await readFile(paths.config, "utf8"), "{}\n");
  await rm(root, { recursive: true, force: true });
});

test("uses sh command lookup and plain npm executable on Linux", () => {
  assert.equal(platformExecutable("npm", "linux"), "npm");
  assert.equal(platformExecutable("pnpm", "linux"), "pnpm");
  assert.deepEqual(commandLookup("npm", "linux"), { command: "sh", args: ["-c", "command -v 'npm'"] });
  assert.deepEqual(commandInvocation("npm", ["install"], "linux"), { command: "npm", args: ["install"] });
});

test("keeps Windows command wrapping isolated", () => {
  assert.equal(platformExecutable("npm", "windows"), "npm.cmd");
  assert.equal(platformExecutable("pnpm", "windows"), "pnpm.cmd");
  assert.deepEqual(commandLookup("npm", "windows"), { command: "where.exe", args: ["npm.cmd"] });
  assert.deepEqual(commandInvocation("npm.cmd", ["install"], "windows"), { command: "cmd.exe", args: ["/d", "/s", "/c", "npm.cmd", "install"] });
});

test("runs direct commands with Linux invocation rules", async () => {
  const code = await runCommand(process.execPath, ["-e", "process.exit(0)"], { quiet: true, platform: "linux" });
  assert.equal(code, 0);
});

test("sets executable permissions on non-Windows platforms when supported", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsundere-chmod-"));
  const script = join(root, "script.sh");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(script, "#!/usr/bin/env sh\nexit 0\n", "utf8"));
  await ensureExecutable(script, "linux");
  const mode = (await stat(script)).mode;
  if (process.platform !== "win32") {
    assert.equal(Boolean(mode & 0o100), true);
  }
  await rm(root, { recursive: true, force: true });
});

test("Linux permission errors include chmod guidance", () => {
  const error = permissionError("/home/cloaxy/.tsundere/bin/tsundere", new Error("EACCES"), "linux");
  assert.match(error.message, /Linux/u);
  assert.match(error.message, /chmod \+x/u);
});
