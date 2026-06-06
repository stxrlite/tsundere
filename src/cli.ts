#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProtectProfile } from "./types.js";
import { loadConfig, validateConfig } from "./config.js";
import { buildProject, devProject, runBuiltProject } from "./compiler/project.js";
import { walk } from "./fs.js";
import { cleanDiscordTypes, doctorDiscordTypes, inspectDiscordType, syncDiscordTypes } from "./type-bridge/cache.js";
import { writeCommandManifest } from "./commands/discovery.js";
import { cleanStore, optimizedNpmInstall, optimizerDoctor, pruneStore, readStorePath } from "./package-optimizer.js";
import { commandExists, currentPlatform, ensureExecutable, ensureTsunderePaths, openFileCommand, platformExecutable, platformLabel, runCommand, runtimeChecks, tsunderePaths } from "./platform/index.js";
import { compareVersions, configureDailyUpdateCheck, latestRelease, selfUpdate } from "./updater.js";

const [, , command = "help", ...args] = process.argv;
const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GITHUB_REPO = "TsundereLang/tsundere";

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
      return build(args);
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
    case "fingerprint":
      return fingerprint(args);
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
  if (!["check", "self", "info", "cron"].includes(action)) {
    throw new Error("Usage: tsundere updater [check|self|info|cron] [--yes] [--force] [--dry-run]");
  }
  if (action === "cron") {
    const cronAction = args[1] ?? "install";
    if (!["install", "remove", "status"].includes(cronAction)) {
      throw new Error("Usage: tsundere updater cron [install|remove|status] [--time HH:mm]");
    }
    const code = await configureDailyUpdateCheck({
      action: cronAction as "install" | "remove" | "status",
      cliPath: fileURLToPath(import.meta.url),
      time: readFlag(args, "--time") ?? "10:00"
    });
    if (code === 0 && cronAction === "install") {
      console.log("Tsundere updater will check for releases once a day.");
    }
    return code;
  }
  const current = packageVersion();
  const repo = updateRepo();
  console.log(`Tsundere ${current}`);
  console.log(`Checking GitHub releases: ${repo}`);
  const latest = await latestRelease(repo, current);
  if (!latest) {
    console.log("Could not read the latest release. Check your network connection or TSUNDERE_UPDATE_REPO.");
    return 1;
  }

  console.log(`Latest release: ${latest.version}`);
  if (action !== "self" && compareVersions(latest.version, current) <= 0) {
    console.log("You are already on the latest known version.");
    return 0;
  }

  if (compareVersions(latest.version, current) <= 0) {
    console.log("You are already on the latest known version.");
  } else {
    console.log(`Update available: ${current} -> ${latest.version}`);
  }
  console.log(`Release page: ${latest.url}`);
  if (action === "check" || action === "info") {
    console.log("Run tsundere updater self --yes to install it automatically.");
    return 0;
  }

  const result = await selfUpdate({
    currentVersion: current,
    repo,
    yes: args.includes("--yes") || args.includes("-y"),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run")
  });
  console.log(result.message);
  if (result.asset) {
    console.log(`Asset: ${result.asset.name}`);
  }
  return result.code;
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

async function build(args: string[] = []): Promise<number> {
  const config = await loadConfig();
  return buildProject(config, process.cwd(), { protect: readProtectOptions(args) });
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
  console.log(`  platform: ${platformLabel()}`);
  const paths = tsunderePaths();
  await ensureTsunderePaths(paths);
  console.log(`  tsundere home: ${paths.root}`);
  console.log(`  config: ${paths.config}`);
  console.log(`  cache: ${paths.cache}`);
  console.log(`  logs: ${paths.logs}`);
  for (const check of await runtimeChecks()) {
    const name = check.name === "node" ? `Tsundere Runtime ${packageVersion()}` : check.name;
    console.log(`  ${name}: ${check.available ? "available" : "missing"} (${check.command})`);
  }
  if (currentPlatform() === "linux") {
    console.log("  linux shell: sh-compatible command lookup enabled");
    await ensureLinuxExecutables();
    console.log("  linux permissions: executable scripts checked");
  }
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

async function ensureLinuxExecutables(): Promise<void> {
  const candidates = [
    resolve(cliRoot, "dist", "cli.js"),
    resolve(cliRoot, "scripts", "install-linux.sh")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      await ensureExecutable(candidate, "linux");
    }
  }
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
  if ((action !== "add" && action !== "install") || !name) {
    throw new Error("Usage: tsundere plugin add|install <name-or-git-url>");
  }
  const config = await loadConfig();
  const packageName = pluginPackageName(name);
  return optimizedNpmInstall(["install", "-D", packageName], { config });
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

async function fingerprint(args: string[]): Promise<number> {
  const action = args[0] ?? "inspect";
  if (action !== "inspect") {
    throw new Error("Usage: tsundere fingerprint inspect [file-or-directory]");
  }
  const target = resolve(process.cwd(), args[1] ?? ".tsundere/runtime-build");
  if (!existsSync(target)) {
    throw new Error(`Fingerprint target not found: ${target}`);
  }
  const targetStats = statSync(target);
  const metadataPath = targetStats.isDirectory() ? resolve(target, "tsundere-protect.json") : "";
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSyncText(metadataPath)) as {
      profile?: string;
      files?: Array<{ file: string; buildId: string; profile: string }>;
    };
    console.log("Tsundere Fingerprint Report");
    console.log(`  profile: ${metadata.profile ?? "unknown"}`);
    for (const file of metadata.files ?? []) {
      console.log(`  ${file.file}: ${file.buildId} (${file.profile})`);
    }
    return 0;
  }
  if (targetStats.isDirectory()) {
    console.log("No Tsundere fingerprint metadata found in this directory.");
    return 1;
  }
  const source = readFileSyncText(target);
  const matches = [...source.matchAll(/[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/gu)].map((match) => match[0]);
  if (matches.length === 0) {
    console.log("No Tsundere fingerprint detected.");
    return 1;
  }
  console.log("Tsundere Fingerprint Report");
  for (const match of new Set(matches)) {
    console.log(`  build: ${match}`);
  }
  return 0;
}

async function pnpm(args: string[], options: { quiet?: boolean } = {}): Promise<number> {
  const packageArgs = withWorkspaceRootFlag(mapBundledPackages(args));
  if (await commandExists("pnpm")) {
    return runCommand(platformExecutable("pnpm"), packageArgs, options);
  }

  if (!options.quiet) {
    console.warn("pnpm was not found. Falling back to npm for this command.");
    console.warn("For the intended Tsundere package workflow, install pnpm with: npm install -g pnpm");
  }
  return runCommand(platformExecutable("npm"), npmFallbackArgs(packageArgs), options);
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

async function openFile(path: string): Promise<number> {
  const command = openFileCommand(path);
  return runCommand(command.command, command.args);
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
Clean .yuri tooling for Discord bots.

Usage:
  tsundere create <name> --template discord
  tsundere dev
  tsundere build
  tsundere build --protect standard
  tsundere start
  tsundere add <package>
  tsundere remove <package>
  tsundere install
  tsundere store path
  tsundere store prune
  tsundere cache clean
  tsundere update [package]
  tsundere updater [check|self|info] [--yes] [--force] [--dry-run]
  tsundere updater cron [install|remove|status] [--time HH:mm]
  tsundere version
  tsundere doctor
  tsundere format
  tsundere lint
  tsundere test
  tsundere docs
  tsundere generate types
  tsundere generate api|route|service|command|model --name <name>
  tsundere plugin add <name>
  tsundere plugin install <name-or-git-url>
  tsundere types sync
  tsundere types inspect <Symbol>
  tsundere types clean
  tsundere types doctor
  tsundere runtime install
  tsundere commands sync
  tsundere fingerprint inspect
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

function readProtectOptions(args: string[]): { profile: ProtectProfile; seed?: string | undefined } | undefined {
  const index = args.indexOf("--protect");
  if (index < 0) {
    return undefined;
  }
  const candidate = args[index + 1];
  const profile = isProtectProfile(candidate) ? candidate : "standard";
  const seed = readFlag(args, "--seed");
  return { profile, seed };
}

function isProtectProfile(value: string | undefined): value is ProtectProfile {
  return value === "standard" || value === "advanced" || value === "maximum";
}

function pluginPackageName(value: string): string {
  if (
    value.startsWith("@") ||
    value.startsWith("file:") ||
    value.startsWith("git+") ||
    value.startsWith("github:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.includes("\\") ||
    value.startsWith(".") ||
    value.startsWith("/")
  ) {
    return value;
  }
  if (/^[\w.-]+\/[\w.-]+(?:#.+)?$/u.test(value)) {
    return `github:${value}`;
  }
  return `@tsundere/plugin-${value}`;
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
    version: "0.1.1",
    type: "module",
    exports: { ".": "./dist/index.js" },
    types: "./dist/index.d.ts",
    dependencies: {
      "discord.js": "^14.26.4"
    }
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
