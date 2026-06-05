#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { loadConfig, validateConfig } from "./config.js";
import { buildProject, devProject, runBuiltProject } from "./compiler/project.js";
import { walk } from "./fs.js";
import { cleanDiscordTypes, doctorDiscordTypes, inspectDiscordType, syncDiscordTypes } from "./type-bridge/cache.js";
import { writeCommandManifest } from "./commands/discovery.js";
import { cleanStore, optimizedNpmInstall, optimizerDoctor, pruneStore, readStorePath } from "./package-optimizer.js";

const [, , command = "help", ...args] = process.argv;
const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GITHUB_REPO = "tsundere-dev/tsundere";

try {
  const code = await run(command, args);
  process.exitCode = code;
} catch (error) {
  console.error(prettyError(error));
  process.exitCode = 1;
}

async function run(command: string, args: string[]): Promise<number> {
  switch (command) {
    case "create":
      return createProject(args);
    case "add":
      return addPackages(args);
    case "remove":
      return removePackages(args);
    case "install":
      return installPackages(args);
    case "store":
      return store(args);
    case "cache":
      return cache(args);
    case "update":
      return updatePackages(args);
    case "updater":
      return updater(args);
    case "version":
      return version();
    case "doctor":
      return doctor();
    case "dev":
      return dev();
    case "build":
      return build();
    case "start":
      return start();
    case "format":
      return format();
    case "lint":
      return lint();
    case "test":
      return test(args);
    case "docs":
      return docs();
    case "generate":
      return generate(args);
    case "plugin":
      return plugin(args);
    case "types":
      return types(args);
    case "runtime":
      return runtime(args);
    case "commands":
      return commands(args);
    case "help":
    default:
      printHelp();
      return 0;
  }
}

async function installPackages(args: string[]): Promise<number> {
  const wantsDiscord = args.includes("@tsundere/discord") || args.length === 0 && projectDependsOnDiscordRuntime();
  if (wantsDiscord) {
    await ensureProjectDiscordRuntime();
  }
  const config = await loadConfig();
  const npmArgs = args.length > 0 ? ["install", ...mapBundledPackages(args)] : ["install"];
  return optimizedNpmInstall(npmArgs, { config });
}

async function addPackages(args: string[]): Promise<number> {
  if (args.length === 0) {
    throw new Error("Usage: tsundere add <package>");
  }
  return installPackages(args);
}

async function removePackages(args: string[]): Promise<number> {
  if (args.length === 0) {
    throw new Error("Usage: tsundere remove <package>");
  }
  const config = await loadConfig();
  return optimizedNpmInstall(["uninstall", ...args], { config });
}

async function updatePackages(args: string[]): Promise<number> {
  const config = await loadConfig();
  return optimizedNpmInstall(["update", ...args], { config });
}

async function runtime(args: string[]): Promise<number> {
  const action = args[0] ?? "install";
  if (action !== "install") {
    throw new Error("Usage: tsundere runtime install");
  }
  await ensureProjectDiscordRuntime(true);
  console.log("Installed bundled @tsundere/discord runtime at .tsundere/runtime/discord");
  return 0;
}

async function updater(args: string[]): Promise<number> {
  const action = args[0] ?? "check";
  if (!["check", "self", "info"].includes(action)) {
    throw new Error("Usage: tsundere updater [check|self|info]");
  }
  const current = packageVersion();
  const repo = updateRepo();
  console.log(`Tsundere ${current}`);
  console.log(`Checking GitHub releases: ${repo}`);
  const latest = await latestRelease(repo);
  if (!latest) {
    console.log("Could not read the latest release. Check your network connection or TSUNDERE_UPDATE_REPO.");
    return 1;
  }

  console.log(`Latest release: ${latest.version}`);
  if (compareVersions(latest.version, current) <= 0) {
    console.log("You are already on the latest known version.");
    return 0;
  }

  console.log(`Update available: ${current} -> ${latest.version}`);
  console.log(`Release page: ${latest.url}`);
  console.log("Current updater flow: download the release zip, unzip it, then run install-tsundere.ps1.");
  console.log("Future updater flow will download and install the release automatically after confirmation.");
  return 0;
}

async function version(): Promise<number> {
  console.log(`Tsundere ${packageVersion()}`);
  console.log(`GitHub releases: ${updateRepo()}`);
  return 0;
}

async function createProject(args: string[]): Promise<number> {
  const name = args.find((arg) => !arg.startsWith("-")) ?? "tsundere-app";
  const template = readFlag(args, "--template") ?? "discord";
  const root = resolve(process.cwd(), name);
  if (existsSync(root)) {
    throw new Error(`Cannot create ${name}: path already exists.`);
  }

  const files = templateFiles(name, template);

  for (const [file, contents] of files) {
    const target = resolve(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
  await installBundledDiscordRuntime(root);

  console.log(`Created ${name} from the ${template} template.`);
  console.log(`Next: cd ${name} && tsundere install && tsundere dev`);
  return 0;
}

async function dev(): Promise<number> {
  const config = await loadConfig();
  validateConfig(config);
  const manifest = await writeCommandManifest(config);
  console.log(`Discovered ${manifest.commands.length} command${manifest.commands.length === 1 ? "" : "s"}.`);
  return devProject(config);
}

async function build(): Promise<number> {
  const config = await loadConfig();
  return buildProject(config);
}

async function start(): Promise<number> {
  const config = await loadConfig();
  return runBuiltProject(config);
}

async function format(): Promise<number> {
  const config = await loadConfig();
  const files = await walk(resolve(process.cwd(), config.source), ".yuri");
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const formatted = source
      .replace(/[ \t]+$/gmu, "")
      .replace(/\n{3,}/gu, "\n\n")
      .trimEnd() + "\n";
    await writeFile(file, formatted, "utf8");
  }
  console.log(`Formatted ${files.length} .yuri file${files.length === 1 ? "" : "s"}.`);
  return 0;
}

async function lint(): Promise<number> {
  const config = await loadConfig();
  const code = await buildProject({ ...config, outDir: ".tsundere/lint" }, process.cwd(), { emitRuntime: false });
  if (code === 0) {
    console.log("No Tsundere lint errors.");
  }
  return code;
}

async function commands(args: string[]): Promise<number> {
  if (args[0] !== "sync") {
    throw new Error("Unknown commands subcommand. Try: tsundere commands sync");
  }
  const config = await loadConfig();
  validateConfig(config);
  const manifest = await writeCommandManifest(config);
  console.log(`Generated .yuri-cache/discord.commands.json with ${manifest.commands.length} command${manifest.commands.length === 1 ? "" : "s"}.`);
  for (const command of manifest.commands) {
    console.log(`/${command.route.join(" ")} <- ${command.file}`);
  }
  return 0;
}

async function doctor(): Promise<number> {
  const config = await loadConfig();
  console.log("Tsundere Doctor");
  console.log(`  project: ${config.name}`);
  console.log(`  source: ${config.source}`);
  console.log(`  output: ${config.outDir}`);
  console.log(`  target: ${config.target}`);
  console.log(`  strict: ${config.strict ? "on" : "off"}`);
  const packageDoctor = await optimizerDoctor(config);
  for (const line of packageDoctor.lines) {
    console.log(line);
  }
  return packageDoctor.ok ? 0 : 1;
}

async function store(args: string[]): Promise<number> {
  const action = args[0] ?? "path";
  const config = await loadConfig();
  if (action === "path") {
    console.log(await readStorePath(config));
    return 0;
  }
  if (action === "prune") {
    const result = await pruneStore(config);
    console.log(`Tch... store pruned at ${result.storePath}`);
    console.log(`Removed ${result.removedEntries} entr${result.removedEntries === 1 ? "y" : "ies"} and ${formatBytes(result.removedBytes)}.`);
    console.log(`Kept ${result.keptEntries} referenced entr${result.keptEntries === 1 ? "y" : "ies"}.`);
    return 0;
  }
  throw new Error("Unknown store command. Try: tsundere store path|prune");
}

async function cache(args: string[]): Promise<number> {
  const action = args[0] ?? "clean";
  if (action !== "clean") {
    throw new Error("Unknown cache command. Try: tsundere cache clean");
  }
  const config = await loadConfig();
  const result = await cleanStore(config);
  console.log(`Tch... cache cleaned at ${result.storePath}`);
  console.log(`Freed ${formatBytes(result.removedBytes)} from the Tsundere store.`);
  return 0;
}

async function test(args: string[]): Promise<number> {
  const packagePath = resolve(process.cwd(), "package.json");
  if (existsSync(packagePath)) {
    const manifest = JSON.parse(stripBom(await readFile(packagePath, "utf8"))) as { scripts?: Record<string, string> };
    if (manifest.scripts?.["test:yuri"]) {
      return pnpm(["run", "test:yuri", ...args]);
    }
  }
  console.log("No Tsundere test runner configured. Add @tsundere/testing and a test:yuri script.");
  return 0;
}

async function docs(): Promise<number> {
  const docsPath = resolve(cliRoot, "docs", "local", "index.html");
  if (!existsSync(docsPath)) {
    console.log("Local docs were not found in this install.");
    console.log("Docs: https://tsundere.dev/docs");
    return 1;
  }
  console.log(`Opening Tsundere docs: ${docsPath}`);
  return openFile(docsPath);
}

async function generate(args: string[]): Promise<number> {
  const target = args[0] ?? "types";
  if (target === "types") {
    const config = await loadConfig();
    await mkdir(resolve(process.cwd(), ".tsundere"), { recursive: true });
    await writeFile(resolve(process.cwd(), ".tsundere", "types.d.ts"), generatedTypes(config.name), "utf8");
    console.log("Generated .tsundere/types.d.ts");
    return 0;
  }

  const name = readFlag(args, "--name") ?? args[1] ?? target;
  const generators: Record<string, (name: string) => [string, string]> = {
    api: generateApi,
    route: generateRoute,
    service: generateService,
    command: generateCommand,
    model: generateModel
  };
  const generator = generators[target];
  if (!generator) {
    throw new Error("Unknown generate target. Try: tsundere generate types|api|route|service|command|model");
  }

  const [file, contents] = generator(name);
  const destination = resolve(process.cwd(), file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
  console.log(`Generated ${file}`);
  return 0;
}

async function plugin(args: string[]): Promise<number> {
  const action = args[0];
  const name = args[1];
  if (action !== "add" || !name) {
    throw new Error("Usage: tsundere plugin add <name>");
  }
  const packageName = name.startsWith("@") ? name : `@tsundere/plugin-${name}`;
  return pnpm(["add", "-D", packageName]);
}

async function types(args: string[]): Promise<number> {
  const action = args[0] ?? "sync";
  switch (action) {
    case "sync": {
      const result = await syncDiscordTypes();
      console.log(`Generated Discord type metadata in ${result.cacheDir}`);
      console.log(`Cache key: ${result.cacheKey.slice(0, 16)}`);
      console.log(`Types: ${result.types.types.length}`);
      return 0;
    }
    case "inspect": {
      const symbol = args[1];
      if (!symbol) {
        throw new Error("Usage: tsundere types inspect <Symbol>");
      }
      const type = await inspectDiscordType(symbol);
      if (!type) {
        console.log(`No cached Discord type found for ${symbol}. Run: tsundere types sync`);
        return 1;
      }
      console.log(JSON.stringify(type, null, 2));
      return 0;
    }
    case "clean":
      await cleanDiscordTypes();
      console.log("Deleted .yuri-cache Discord type metadata.");
      return 0;
    case "doctor": {
      const result = await doctorDiscordTypes();
      for (const message of result.messages) {
        console.log(message);
      }
      return result.ok ? 0 : 1;
    }
    default:
      throw new Error("Unknown types command. Try: tsundere types sync|inspect|clean|doctor");
  }
}

async function pnpm(args: string[], options: { quiet?: boolean } = {}): Promise<number> {
  const packageArgs = withWorkspaceRootFlag(mapBundledPackages(args));
  if (await commandExists(process.platform === "win32" ? "pnpm.cmd" : "pnpm")) {
    return runCommand(process.platform === "win32" ? "pnpm.cmd" : "pnpm", packageArgs, options);
  }

  if (!options.quiet) {
    console.warn("pnpm was not found. Falling back to npm for this command.");
    console.warn("For the intended Tsundere package workflow, install pnpm with: npm install -g pnpm");
  }
  return runCommand(process.platform === "win32" ? "npm.cmd" : "npm", npmFallbackArgs(packageArgs), options);
}

async function commandExists(command: string): Promise<boolean> {
  const checker = process.platform === "win32" ? "where.exe" : "sh";
  const args = process.platform === "win32" ? [command] : ["-c", `command -v ${command}`];
  return (await runCommand(checker, args, { quiet: true })) === 0;
}

function npmFallbackArgs(args: string[]): string[] {
  const [command, ...rest] = args;
  if (!command) {
    return ["install"];
  }
  switch (command) {
    case "add":
      return ["install", ...rest.filter((arg) => arg !== "-w" && arg !== "--workspace-root")];
    case "remove":
      return ["uninstall", ...rest.filter((arg) => arg !== "-w" && arg !== "--workspace-root")];
    case "install":
    case "update":
    case "run":
      return [command, ...rest.filter((arg) => arg !== "-w" && arg !== "--workspace-root")];
    case "--version":
      return ["--version"];
    default:
      return [command, ...rest];
  }
}

async function runCommand(command: string, args: string[], options: { quiet?: boolean } = {}): Promise<number> {
  return new Promise((resolveCode) => {
    const executable = process.platform === "win32" && command.endsWith(".cmd") ? "cmd.exe" : command;
    const commandArgs = process.platform === "win32" && command.endsWith(".cmd")
      ? ["/d", "/s", "/c", command, ...args]
      : args;
    const child = spawn(executable, commandArgs, {
      cwd: process.cwd(),
      stdio: options.quiet ? "ignore" : "inherit",
      shell: false
    });
    child.on("error", () => resolveCode(1));
    child.on("close", (code) => resolveCode(code ?? 1));
  });
}

async function openFile(path: string): Promise<number> {
  if (process.platform === "win32") {
    return runCommand("cmd.exe", ["/c", "start", "", path]);
  }
  if (process.platform === "darwin") {
    return runCommand("open", [path]);
  }
  return runCommand("xdg-open", [path]);
}

function mapBundledPackages(args: string[]): string[] {
  return args.map((arg) => {
    if (arg !== "@tsundere/discord") {
      return arg;
    }
    const projectRuntime = resolve(process.cwd(), ".tsundere", "runtime", "discord");
    if (existsSync(resolve(projectRuntime, "package.json"))) {
      return "file:.tsundere/runtime/discord";
    }
    const bundled = resolve(cliRoot, "packages", "discord");
    return existsSync(resolve(bundled, "package.json")) ? `file:${bundled}` : arg;
  });
}

function withWorkspaceRootFlag(args: string[]): string[] {
  const command = args[0];
  const shouldTargetRoot =
    (command === "add" || command === "remove" || command === "update") &&
    existsSync(resolve(process.cwd(), "pnpm-workspace.yaml")) &&
    !args.includes("-w") &&
    !args.includes("--workspace-root");
  return shouldTargetRoot ? [command, "-w", ...args.slice(1)] : args;
}

function printHelp(): void {
  console.log(`Tsundere ${packageVersion()}
TypeScript-style .yuri tooling for Discord bots.

Usage:
  tsundere create <name> --template discord
  tsundere dev
  tsundere build
  tsundere start
  tsundere add <package>
  tsundere remove <package>
  tsundere install
  tsundere store path
  tsundere store prune
  tsundere cache clean
  tsundere update [package]
  tsundere updater [check|self|info]
  tsundere version
  tsundere doctor
  tsundere format
  tsundere lint
  tsundere test
  tsundere docs
  tsundere generate types
  tsundere generate api|route|service|command|model --name <name>
  tsundere plugin add <name>
  tsundere types sync
  tsundere types inspect <Symbol>
  tsundere types clean
  tsundere types doctor
  tsundere runtime install
  tsundere commands sync
`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function packageVersion(): string {
  const packagePath = resolve(cliRoot, "package.json");
  if (!existsSync(packagePath)) {
    return "0.0.0";
  }
  const manifest = JSON.parse(readFileSyncText(packagePath)) as { version?: string };
  return manifest.version ?? "0.0.0";
}

function updateRepo(): string {
  const envRepo = process.env.TSUNDERE_UPDATE_REPO;
  if (envRepo) {
    return envRepo;
  }
  const packagePath = resolve(cliRoot, "package.json");
  if (!existsSync(packagePath)) {
    return DEFAULT_GITHUB_REPO;
  }
  const manifest = JSON.parse(readFileSyncText(packagePath)) as { tsundere?: { githubRepo?: string } };
  return manifest.tsundere?.githubRepo ?? DEFAULT_GITHUB_REPO;
}

async function latestRelease(repo: string): Promise<{ version: string; url: string } | undefined> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": `tsundere-cli/${packageVersion()}`
      }
    });
    if (!response.ok) {
      return undefined;
    }
    const json = await response.json() as { tag_name?: string; html_url?: string };
    const version = normalizeVersion(json.tag_name ?? "");
    if (!version) {
      return undefined;
    }
    return { version, url: json.html_url ?? `https://github.com/${repo}/releases/latest` };
  } catch {
    return undefined;
  }
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/iu, "");
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function prettyError(error: unknown): string {
  if (error instanceof Error) {
    return `Tsundere compiler error\n  ${error.message}`;
  }
  return String(error);
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function templateFiles(name: string, template: string): Map<string, string> {
  const common = new Map<string, string>([
    ["package.json", `${JSON.stringify({
      name,
      type: "module",
      scripts: {
        dev: "tsundere dev",
        build: "tsundere build",
        start: "tsundere start",
        lint: "tsundere lint",
        format: "tsundere format",
        test: "tsundere test"
      },
      dependencies: {
        "@tsundere/discord": "file:.tsundere/runtime/discord"
      }
    }, null, 2)}\n`],
    ["tsundere.config.json", `${JSON.stringify({
      name,
      source: "src",
      outDir: "build",
      target: "typescript",
      strict: true,
      sourceMaps: true,
      commands: {
        discovery: true,
        routeBased: true,
        directory: "./src/commands",
        groups: {
          "./src/commands/admin": {
            routeBased: true,
            groupName: "admin"
          }
        }
      }
    }, null, 2)}\n`],
    [".gitignore", "node_modules/\nbuild/\n.tsundere/\n.env\n"],
    [".env.example", "DISCORD_TOKEN=replace-me\n"]
  ]);

  const main = templateMain(name, template);
  common.set("src/main.yuri", main);
  if (template === "discord") {
    common.set("src/commands/ping.yuri", `import { Slash } from "@tsundere/discord"

export default Slash.command("ping")
  .description("Check bot latency")
`);
  }
  return common;
}

async function installBundledDiscordRuntime(projectRoot: string): Promise<void> {
  const sourceDist = resolve(cliRoot, "dist", "discord");
  const targetRoot = resolve(projectRoot, ".tsundere", "runtime", "discord");
  const targetDist = resolve(targetRoot, "dist");
  if (!existsSync(sourceDist)) {
    return;
  }
  await mkdir(targetRoot, { recursive: true });
  await cp(sourceDist, targetDist, { recursive: true, force: true });
  await writeFile(resolve(targetRoot, "package.json"), `${JSON.stringify({
    name: "@tsundere/discord",
    version: "0.1.0",
    type: "module",
    exports: { ".": "./dist/index.js" },
    types: "./dist/index.d.ts"
  }, null, 2)}\n`, "utf8");
}

function projectDependsOnDiscordRuntime(): boolean {
  const packagePath = resolve(process.cwd(), "package.json");
  if (!existsSync(packagePath)) {
    return false;
  }
  const manifest = JSON.parse(readFileSyncText(packagePath)) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return Boolean(manifest.dependencies?.["@tsundere/discord"] || manifest.devDependencies?.["@tsundere/discord"]);
}

async function ensureProjectDiscordRuntime(forceManifest = false): Promise<void> {
  await installBundledDiscordRuntime(process.cwd());
  const packagePath = resolve(process.cwd(), "package.json");
  if (!existsSync(packagePath)) {
    return;
  }
  const manifest = JSON.parse(stripBom(await readFile(packagePath, "utf8"))) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  manifest.dependencies ??= {};
  if (forceManifest || manifest.dependencies["@tsundere/discord"] || manifest.devDependencies?.["@tsundere/discord"]) {
    manifest.dependencies["@tsundere/discord"] = "file:.tsundere/runtime/discord";
    if (manifest.devDependencies?.["@tsundere/discord"]) {
      delete manifest.devDependencies["@tsundere/discord"];
    }
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

function readFileSyncText(path: string): string {
  return stripBom(readFileSync(path, "utf8"));
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function templateMain(name: string, template: string): string {
  switch (template) {
    case "empty":
      return "export const name = \"Tsundere\"\n";
    case "rest":
      return `import express from "express"

const app = express()

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "${name}" })
})

app.listen(env.PORT ?? 3000)
`;
    case "websocket":
      return `import { WebSocketServer } from "ws"

const server = new WebSocketServer({ port: Number(env.PORT ?? 3000) })

server.on("connection", (socket) => {
  socket.send("${name} online")
})
`;
    case "microservice":
      return `export async function handleJob(input: { id: string }) {
  return { id: input.id, ok: true }
}
`;
    case "cli":
      return `const [command = "help"] = process.argv.slice(2)

if command == "help" {
  log("${name} commands: help")
}
`;
    case "discord":
    default:
      return `import { Client, Intents, Slash, Embed } from "@tsundere/discord"

const client = new Client({
  token: env.DISCORD_TOKEN,
  intents: [Intents.Guilds, Intents.GuildMessages]
})

client.once("ready", () => {
  log("${name} online")
})

client.on("interactionCreate", async (interaction) => {
  if interaction.isCommand("ping") {
    await interaction.reply({
      embeds: [
        Embed.create()
          .title("Pong")
          .description(\`Latency: \${client.ping}ms\`)
          .color("#ff7ab6")
          .toJSON()
      ],
      ephemeral: true
    })
  }
})

Slash.command("ping")
  .description("Check bot latency")
  .register(client)

client.login()
`;
  }
}

function generatedTypes(projectName: string): string {
  return `declare const env: NodeJS.ProcessEnv;
declare const log: typeof console.log;
declare module "*.yuri" {
  const module: unknown;
  export default module;
}
declare namespace TsundereProject {
  const name: "${projectName}";
}
`;
}

function generateApi(name: string): [string, string] {
  const typeName = pascal(name);
  return [`src/api/${name}.yuri`, `export interface ${typeName}Response {
  ok: boolean
}

export async function handle${typeName}(): Promise<${typeName}Response> {
  return { ok: true }
}
`];
}

function generateRoute(name: string): [string, string] {
  return [`src/routes/${name}.yuri`, `export const path = "/${name}"

export async function get(_request: Request): Promise<Response> {
  return Response.json({ route: path })
}
`];
}

function generateService(name: string): [string, string] {
  const typeName = pascal(name);
  return [`src/services/${typeName}Service.yuri`, `export class ${typeName}Service {
  async run() {
    return { ok: true }
  }
}
`];
}

function generateCommand(name: string): [string, string] {
  return [`src/commands/${name}.yuri`, `import { Slash } from "@tsundere/discord"

export const command = Slash.command("${name}")
  .description("${pascal(name)} command")
`];
}

function generateModel(name: string): [string, string] {
  const typeName = pascal(name);
  return [`src/models/${typeName}.yuri`, `export interface ${typeName} {
  id: string
  createdAt: Date
  updatedAt: Date
}
`];
}

function pascal(value: string): string {
  return value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}
