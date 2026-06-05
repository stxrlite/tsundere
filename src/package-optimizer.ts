import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, link, lstat, mkdir, opendir, readFile, readlink, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { existsSync } from "node:fs";
import type { TsundereConfig } from "./types.js";
import { commandExists, defaultStorePath, ensureTsunderePaths, expandHomePath, platformExecutable, runCommand, runtimeChecks, tsunderePaths } from "./platform/index.js";

export type TsundereLinkMode = "auto" | "hardlink" | "copy";

export interface TsundereInstallConfig {
  storePath: string;
  linkMode: TsundereLinkMode;
  strictDependencies: boolean;
  themeLogs: boolean;
}

export interface InstallMetrics {
  elapsedMs: number;
  cacheHits: number;
  cacheMisses: number;
  reusedPackages: number;
  storedPackages: number;
  linkedPackages: number;
  copiedPackages: number;
  existingPackages: number;
  corruptEntries: number;
  strictWarnings: number;
}

export interface StorePruneResult {
  storePath: string;
  removedEntries: number;
  removedBytes: number;
  keptEntries: number;
}

interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockPackage>;
}

interface NpmLockPackage {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  dependencies?: Record<string, string>;
  dev?: boolean;
  optional?: boolean;
}

interface PackageEntry {
  name: string;
  version: string;
  integrity: string;
  lockPath: string;
  diskPath: string;
  direct: boolean;
}

interface StoreMetadata {
  name: string;
  version: string;
  integrity: string;
  directoryHash: string;
  createdAt: string;
  lastUsedAt: string;
}

interface StoreEntry {
  key: string;
  root: string;
  files: string;
  metadata: string;
}

interface HydrateResult {
  hits: number;
  misses: number;
  reused: number;
  linked: number;
  copied: number;
  existing: number;
  corrupt: number;
}

interface HarvestResult {
  stored: number;
  hits: number;
  corrupt: number;
  keys: string[];
}

interface OptimizedInstallOptions {
  cwd?: string;
  config?: TsundereConfig;
  npmRunner?: (args: string[], cwd: string) => Promise<number>;
}

interface PackageManifest {
  name?: string;
  version?: string;
  packageManager?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface WorkspaceSnapshot {
  packages: string[];
  packageManager: string;
  lockfile: string;
}

export function resolveInstallConfig(config: Partial<TsundereConfig> = {}, cwd = process.cwd()): TsundereInstallConfig {
  return {
    storePath: resolveStorePath(config.storePath, cwd),
    linkMode: config.linkMode ?? "auto",
    strictDependencies: config.strictDependencies ?? false,
    themeLogs: config.themeLogs ?? true
  };
}

export async function optimizedNpmInstall(npmArgs: string[], options: OptimizedInstallOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const installConfig = resolveInstallConfig(options.config, cwd);
  const startedAt = Date.now();
  await ensureTsunderePaths(tsunderePaths());
  await ensureStore(installConfig.storePath);
  const beforeEntries = await readPackageEntries(cwd);
  const hydrate = await hydrateCachedPackages(beforeEntries, installConfig);
  const npmRunner = options.npmRunner ?? runNpmCommand;
  const npmCode = await npmRunner(npmArgs, cwd);
  const afterEntries = npmCode === 0 ? await readPackageEntries(cwd) : [];
  const harvest = npmCode === 0 ? await harvestProjectPackages(afterEntries, installConfig) : { stored: 0, hits: 0, corrupt: 0, keys: [] };
  if (npmCode === 0) {
    await writeProjectRefs(installConfig.storePath, cwd, harvest.keys);
    await syncTsunderePackageFiles(cwd, installConfig, afterEntries);
  }
  const strictWarnings = npmCode === 0 && installConfig.strictDependencies
    ? await strictDependencyWarnings(cwd, afterEntries)
    : 0;
  const metrics: InstallMetrics = {
    elapsedMs: Date.now() - startedAt,
    cacheHits: hydrate.hits + harvest.hits,
    cacheMisses: hydrate.misses,
    reusedPackages: hydrate.reused,
    storedPackages: harvest.stored,
    linkedPackages: hydrate.linked,
    copiedPackages: hydrate.copied,
    existingPackages: hydrate.existing,
    corruptEntries: hydrate.corrupt + harvest.corrupt,
    strictWarnings
  };
  printInstallMetrics(metrics, installConfig);
  return npmCode;
}

export async function readStorePath(config: Partial<TsundereConfig> = {}, cwd = process.cwd()): Promise<string> {
  const installConfig = resolveInstallConfig(config, cwd);
  await ensureTsunderePaths(tsunderePaths());
  await ensureStore(installConfig.storePath);
  return installConfig.storePath;
}

export async function pruneStore(config: Partial<TsundereConfig> = {}, cwd = process.cwd()): Promise<StorePruneResult> {
  const installConfig = resolveInstallConfig(config, cwd);
  await ensureTsunderePaths(tsunderePaths());
  await ensureStore(installConfig.storePath);
  const referenced = await readReferencedStoreKeys(installConfig.storePath);
  const entries = await listStoreEntries(installConfig.storePath);
  let removedEntries = 0;
  let removedBytes = 0;
  let keptEntries = 0;
  for (const entry of entries) {
    const metadata = await readMetadata(entry.metadata);
    const valid = metadata ? await validateStoreEntry(entry, metadata) : false;
    if (valid && referenced.has(entry.key)) {
      keptEntries += 1;
      continue;
    }
    removedBytes += await directorySize(entry.root);
    await safeRemoveStorePath(installConfig.storePath, entry.root);
    removedEntries += 1;
  }
  return { storePath: installConfig.storePath, removedEntries, removedBytes, keptEntries };
}

export async function cleanStore(config: Partial<TsundereConfig> = {}, cwd = process.cwd()): Promise<StorePruneResult> {
  const installConfig = resolveInstallConfig(config, cwd);
  await ensureTsunderePaths(tsunderePaths());
  await ensureStore(installConfig.storePath);
  const target = resolve(installConfig.storePath);
  const removedBytes = await directorySize(target);
  await safeRemoveStorePath(dirname(target), target);
  await ensureStore(installConfig.storePath);
  return { storePath: installConfig.storePath, removedEntries: 0, removedBytes, keptEntries: 0 };
}

export async function optimizerDoctor(config: Partial<TsundereConfig> = {}, cwd = process.cwd()): Promise<{ ok: boolean; lines: string[] }> {
  const installConfig = resolveInstallConfig(config, cwd);
  await ensureTsunderePaths(tsunderePaths());
  await ensureStore(installConfig.storePath);
  const entries = await listStoreEntries(installConfig.storePath);
  let invalid = 0;
  for (const entry of entries) {
    const metadata = await readMetadata(entry.metadata);
    if (!metadata || !(await validateStoreEntry(entry, metadata))) {
      invalid += 1;
    }
  }
  const checks = await runtimeChecks();
  const nodeCheck = checks.find((check) => check.name === "node");
  const npmCheck = checks.find((check) => check.name === "npm");
  const npmOk = npmCheck?.available ?? false;
  return {
    ok: Boolean(nodeCheck?.available) && npmOk && invalid === 0,
    lines: [
      `  tsundere store: ${installConfig.storePath}`,
      `  link mode: ${installConfig.linkMode}`,
      `  strict dependencies: ${installConfig.strictDependencies ? "report" : "off"}`,
      `  workspace yaml: ${existsSync(resolve(cwd, "tsundere-workspace.yaml")) ? "present" : "missing"}`,
      `  lock yaml: ${existsSync(resolve(cwd, "tsundere-lock.yaml")) ? "present" : "missing"}`,
      `  cached packages: ${entries.length}`,
      `  invalid store entries: ${invalid}`
    ]
  };
}

export async function syncTsunderePackageFiles(cwd: string, config: TsundereInstallConfig, entries?: PackageEntry[]): Promise<void> {
  const lockPath = resolve(cwd, "package-lock.json");
  const manifestPath = resolve(cwd, "package.json");
  if (!existsSync(lockPath) || !existsSync(manifestPath)) {
    return;
  }
  const manifest = JSON.parse(stripBom(await readFile(manifestPath, "utf8"))) as PackageManifest;
  const lock = JSON.parse(stripBom(await readFile(lockPath, "utf8"))) as NpmLockfile;
  const packageEntries = entries ?? await readPackageEntries(cwd);
  const workspace = workspaceSnapshot(manifest);
  await writeFile(resolve(cwd, "tsundere-workspace.yaml"), yamlStringify(workspaceYaml(workspace)), "utf8");
  await writeFile(resolve(cwd, "tsundere-lock.yaml"), yamlStringify(lockYaml(cwd, manifest, lock, config, packageEntries, workspace)), "utf8");
}

export async function hydrateCachedPackages(entries: PackageEntry[], config: TsundereInstallConfig): Promise<HydrateResult> {
  const result: HydrateResult = { hits: 0, misses: 0, reused: 0, linked: 0, copied: 0, existing: 0, corrupt: 0 };
  for (const entry of entries) {
    if (existsSync(entry.diskPath)) {
      result.existing += 1;
      continue;
    }
    const storeEntry = storeEntryFor(config.storePath, entry);
    const metadata = await readMetadata(storeEntry.metadata);
    if (!metadata) {
      result.misses += 1;
      continue;
    }
    if (!(await validateStoreEntry(storeEntry, metadata, entry))) {
      result.corrupt += 1;
      result.misses += 1;
      continue;
    }
    const mode = await materializePackage(storeEntry.files, entry.diskPath, config.linkMode);
    result.hits += 1;
    result.reused += 1;
    if (mode === "hardlink") {
      result.linked += 1;
    } else {
      result.copied += 1;
    }
    await touchMetadata(storeEntry.metadata, metadata);
  }
  return result;
}

export async function harvestProjectPackages(entries: PackageEntry[], config: TsundereInstallConfig): Promise<HarvestResult> {
  const result: HarvestResult = { stored: 0, hits: 0, corrupt: 0, keys: [] };
  for (const entry of entries) {
    if (!existsSync(entry.diskPath)) {
      continue;
    }
    const storeEntry = storeEntryFor(config.storePath, entry);
    result.keys.push(storeEntry.key);
    const metadata = await readMetadata(storeEntry.metadata);
    if (metadata && await validateStoreEntry(storeEntry, metadata, entry)) {
      result.hits += 1;
      await touchMetadata(storeEntry.metadata, metadata);
      continue;
    }
    if (metadata) {
      result.corrupt += 1;
      await safeRemoveStorePath(config.storePath, storeEntry.root);
    }
    const directoryHash = await hashDirectory(entry.diskPath);
    await writeStoreEntry(config.storePath, storeEntry, entry, directoryHash);
    result.stored += 1;
  }
  return result;
}

async function readPackageEntries(cwd: string): Promise<PackageEntry[]> {
  const lockPath = resolve(cwd, "package-lock.json");
  if (!existsSync(lockPath)) {
    return [];
  }
  const lock = JSON.parse(stripBom(await readFile(lockPath, "utf8"))) as NpmLockfile;
  const rootPackage = lock.packages?.[""] ?? {};
  const direct = new Set([
    ...Object.keys(rootPackage.dependencies ?? {})
  ]);
  const entries: PackageEntry[] = [];
  for (const [packagePath, packageInfo] of Object.entries(lock.packages ?? {})) {
    if (!packagePath.startsWith("node_modules/") || packageInfo.link || !packageInfo.version || !packageInfo.integrity) {
      continue;
    }
    const name = packageNameFromLockPath(packagePath);
    if (!name) {
      continue;
    }
    entries.push({
      name,
      version: packageInfo.version,
      integrity: packageInfo.integrity,
      lockPath: packagePath,
      diskPath: resolve(cwd, ...packagePath.split("/")),
      direct: direct.has(name)
    });
  }
  return entries;
}

function workspaceSnapshot(manifest: PackageManifest): WorkspaceSnapshot {
  const packageManager = manifest.packageManager?.split("@")[0] ?? "npm";
  return {
    packages: workspacePackages(manifest),
    packageManager,
    lockfile: "tsundere-lock.yaml"
  };
}

function workspacePackages(manifest: PackageManifest): string[] {
  if (Array.isArray(manifest.workspaces) && manifest.workspaces.length > 0) {
    return [".", ...manifest.workspaces.filter((item) => item !== ".")];
  }
  if (manifest.workspaces && !Array.isArray(manifest.workspaces) && Array.isArray(manifest.workspaces.packages) && manifest.workspaces.packages.length > 0) {
    return [".", ...manifest.workspaces.packages.filter((item) => item !== ".")];
  }
  return ["."];
}

function workspaceYaml(workspace: WorkspaceSnapshot): Record<string, unknown> {
  return {
    packages: workspace.packages,
    packageManager: workspace.packageManager,
    lockfile: workspace.lockfile
  };
}

function lockYaml(
  cwd: string,
  manifest: PackageManifest,
  lock: NpmLockfile,
  config: TsundereInstallConfig,
  entries: PackageEntry[],
  workspace: WorkspaceSnapshot
): Record<string, unknown> {
  const entryByLockPath = new Map(entries.map((entry) => [entry.lockPath, entry]));
  const importers: Record<string, unknown> = {};
  const packages: Record<string, unknown> = {};
  for (const [lockPath, packageInfo] of Object.entries(lock.packages ?? {})) {
    if (lockPath === "") {
      importers["."] = importerYaml(manifest, packageInfo);
      continue;
    }
    if (!lockPath.startsWith("node_modules/") || packageInfo.link || !packageInfo.version) {
      const importerPath = normalizeWorkspaceImporter(lockPath);
      if (importerPath) {
        importers[importerPath] = importerYaml(undefined, packageInfo);
      }
      continue;
    }
    const name = packageNameFromLockPath(lockPath);
    if (!name) {
      continue;
    }
    const entry = entryByLockPath.get(lockPath);
    const packageKey = `/${name}/${packageInfo.version}`;
    packages[packageKey] = compactObject({
      name,
      version: packageInfo.version,
      resolution: compactObject({
        integrity: packageInfo.integrity,
        tarball: packageInfo.resolved
      }),
      dependencies: packageInfo.dependencies,
      dev: packageInfo.dev || undefined,
      optional: packageInfo.optional || undefined,
      storeKey: entry ? storeEntryFor(config.storePath, entry).key : undefined
    });
  }
  return {
    lockfileVersion: 1,
    npmLockfileVersion: lock.lockfileVersion ?? 0,
    generatedBy: "tsundere",
    packageManager: workspace.packageManager,
    workspace: {
      packages: workspace.packages
    },
    importers,
    packages
  };
}

function importerYaml(manifest: PackageManifest | undefined, lockPackage: NpmLockPackage): Record<string, unknown> {
  return compactObject({
    name: manifest?.name ?? lockPackage.name,
    version: manifest?.version ?? lockPackage.version,
    dependencies: manifest?.dependencies ?? lockPackage.dependencies,
    devDependencies: manifest?.devDependencies,
    optionalDependencies: manifest?.optionalDependencies,
    peerDependencies: manifest?.peerDependencies
  });
}

function normalizeWorkspaceImporter(lockPath: string): string | undefined {
  if (!lockPath || lockPath.startsWith("node_modules/")) {
    return undefined;
  }
  return lockPath.replace(/\\/gu, "/");
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      continue;
    }
    if (isPlainObject(child) && Object.keys(child).length === 0) {
      continue;
    }
    compacted[key] = child;
  }
  return compacted;
}

function yamlStringify(value: unknown): string {
  return `${yamlValue(value, 0)}\n`;
}

function yamlValue(value: unknown, indent: number): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return value.map((item) => `${spaces(indent)}- ${yamlInlineOrBlock(item, indent + 2)}`).join("\n");
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "{}";
    }
    return entries.map(([key, child]) => {
      if (Array.isArray(child) && child.length === 0) {
        return `${spaces(indent)}${yamlKey(key)}: []`;
      }
      if (isPlainObject(child) && Object.keys(child).length === 0) {
        return `${spaces(indent)}${yamlKey(key)}: {}`;
      }
      if (Array.isArray(child) || isPlainObject(child)) {
        return `${spaces(indent)}${yamlKey(key)}:\n${yamlValue(child, indent + 2)}`;
      }
      return `${spaces(indent)}${yamlKey(key)}: ${yamlScalar(child)}`;
    }).join("\n");
  }
  return yamlScalar(value);
}

function yamlInlineOrBlock(value: unknown, indent: number): string {
  if (Array.isArray(value) || isPlainObject(value)) {
    return `\n${yamlValue(value, indent)}`;
  }
  return yamlScalar(value);
}

function yamlKey(value: string): string {
  return /^[A-Za-z0-9_.-]+$/u.test(value) ? value : JSON.stringify(value);
}

function yamlScalar(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(String(value));
}

function spaces(count: number): string {
  return " ".repeat(count);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function packageNameFromLockPath(packagePath: string): string | undefined {
  const parts = packagePath.split("/");
  const lastNodeModules = parts.lastIndexOf("node_modules");
  if (lastNodeModules < 0) {
    return undefined;
  }
  const first = parts[lastNodeModules + 1];
  if (!first) {
    return undefined;
  }
  if (first.startsWith("@")) {
    const second = parts[lastNodeModules + 2];
    return second ? `${first}/${second}` : undefined;
  }
  return first;
}

function resolveStorePath(value: string | undefined, cwd: string): string {
  return value ? expandHomePath(value, cwd) : defaultStorePath();
}

async function ensureStore(storePath: string): Promise<void> {
  await mkdir(join(storePath, "packages"), { recursive: true });
  await mkdir(join(storePath, ".tmp"), { recursive: true });
}

function storeEntryFor(storePath: string, entry: PackageEntry): StoreEntry {
  const integrityHash = createHash("sha256").update(entry.integrity).digest("hex");
  const key = `${encodeName(entry.name)}/${entry.version}/${integrityHash}`;
  const root = join(storePath, "packages", encodeName(entry.name), entry.version, integrityHash);
  return {
    key,
    root,
    files: join(root, "files"),
    metadata: join(root, "metadata.json")
  };
}

function encodeName(name: string): string {
  return encodeURIComponent(name);
}

async function readMetadata(path: string): Promise<StoreMetadata | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as StoreMetadata;
  } catch {
    return undefined;
  }
}

async function validateStoreEntry(storeEntry: StoreEntry, metadata: StoreMetadata, expected?: PackageEntry): Promise<boolean> {
  if (expected && (metadata.name !== expected.name || metadata.version !== expected.version || metadata.integrity !== expected.integrity)) {
    return false;
  }
  if (!existsSync(storeEntry.files)) {
    return false;
  }
  return await hashDirectory(storeEntry.files) === metadata.directoryHash;
}

async function touchMetadata(path: string, metadata: StoreMetadata): Promise<void> {
  await writeFile(path, `${JSON.stringify({ ...metadata, lastUsedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

async function writeStoreEntry(storePath: string, storeEntry: StoreEntry, entry: PackageEntry, directoryHash: string): Promise<void> {
  const tmp = join(storePath, ".tmp", `${process.pid}-${Date.now()}-${createHash("sha256").update(storeEntry.key).digest("hex")}`);
  await mkdir(dirname(tmp), { recursive: true });
  try {
    await cp(entry.diskPath, join(tmp, "files"), { recursive: true, force: true, dereference: false });
    const metadata: StoreMetadata = {
      name: entry.name,
      version: entry.version,
      integrity: entry.integrity,
      directoryHash,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    };
    await writeFile(join(tmp, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await mkdir(dirname(storeEntry.root), { recursive: true });
    await safeRemoveStorePath(storePath, storeEntry.root);
    await rename(tmp, storeEntry.root);
  } catch (error) {
    await safeRemoveStorePath(storePath, tmp);
    throw error;
  }
}

async function materializePackage(source: string, destination: string, mode: TsundereLinkMode): Promise<"hardlink" | "copy"> {
  await mkdir(dirname(destination), { recursive: true });
  if (mode === "copy") {
    await cp(source, destination, { recursive: true, force: false, dereference: false });
    return "copy";
  }
  try {
    await hardlinkDirectory(source, destination);
    return "hardlink";
  } catch {
    await safeRemoveProjectHydration(destination);
    await cp(source, destination, { recursive: true, force: false, dereference: false });
    return "copy";
  }
}

async function hardlinkDirectory(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const directory = await opendir(source);
  for await (const entry of directory) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await hardlinkDirectory(sourcePath, destinationPath);
    } else if (entry.isSymbolicLink()) {
      await cp(sourcePath, destinationPath, { dereference: false });
    } else if (entry.isFile()) {
      await link(sourcePath, destinationPath);
    }
  }
}

async function hashDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  await hashDirectoryInner(root, "", hash);
  return hash.digest("hex");
}

async function hashDirectoryInner(root: string, prefix: string, hash: ReturnType<typeof createHash>): Promise<void> {
  const entries = [];
  const directory = await opendir(join(root, prefix));
  for await (const entry of directory) {
    entries.push(entry);
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(root, relativePath);
    const info = await lstat(absolutePath);
    hash.update(`${relativePath}\0${info.mode}\0${info.size}\0`);
    if (entry.isDirectory()) {
      await hashDirectoryInner(root, relativePath, hash);
    } else if (entry.isSymbolicLink()) {
      hash.update(`link:${await readlink(absolutePath)}\0`);
    } else if (entry.isFile()) {
      await hashFile(absolutePath, hash);
    }
  }
}

async function hashFile(path: string, hash: ReturnType<typeof createHash>): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
}

async function writeProjectRefs(storePath: string, cwd: string, keys: string[]): Promise<void> {
  const refsPath = join(storePath, "refs.json");
  const refs = await readRefs(refsPath);
  refs[resolve(cwd)] = Array.from(new Set(keys)).sort();
  await writeFile(refsPath, `${JSON.stringify(refs, null, 2)}\n`, "utf8");
}

async function readReferencedStoreKeys(storePath: string): Promise<Set<string>> {
  const refs = await readRefs(join(storePath, "refs.json"));
  const keys = new Set<string>();
  for (const projectKeys of Object.values(refs)) {
    for (const key of projectKeys) {
      keys.add(key);
    }
  }
  return keys;
}

async function readRefs(refsPath: string): Promise<Record<string, string[]>> {
  try {
    return JSON.parse(await readFile(refsPath, "utf8")) as Record<string, string[]>;
  } catch {
    return {};
  }
}

async function listStoreEntries(storePath: string): Promise<StoreEntry[]> {
  const packagesRoot = join(storePath, "packages");
  if (!existsSync(packagesRoot)) {
    return [];
  }
  const entries: StoreEntry[] = [];
  await listStoreEntriesInner(storePath, packagesRoot, entries);
  return entries;
}

async function listStoreEntriesInner(storePath: string, current: string, entries: StoreEntry[]): Promise<void> {
  const directory = await opendir(current);
  for await (const entry of directory) {
    if (!entry.isDirectory()) {
      continue;
    }
    const entryPath = join(current, entry.name);
    const metadataPath = join(entryPath, "metadata.json");
    const filesPath = join(entryPath, "files");
    if (existsSync(metadataPath) || existsSync(filesPath)) {
      entries.push({
        key: relative(join(storePath, "packages"), entryPath).split(sep).join("/"),
        root: entryPath,
        files: filesPath,
        metadata: metadataPath
      });
    } else {
      await listStoreEntriesInner(storePath, entryPath, entries);
    }
  }
}

async function directorySize(path: string): Promise<number> {
  if (!existsSync(path)) {
    return 0;
  }
  const info = await stat(path);
  if (info.isFile()) {
    return info.size;
  }
  if (!info.isDirectory()) {
    return 0;
  }
  let total = 0;
  const directory = await opendir(path);
  for await (const entry of directory) {
    total += await directorySize(join(path, entry.name));
  }
  return total;
}

async function strictDependencyWarnings(cwd: string, entries: PackageEntry[]): Promise<number> {
  const packagePath = resolve(cwd, "package.json");
  if (!existsSync(packagePath)) {
    return 0;
  }
  const manifest = JSON.parse(stripBom(await readFile(packagePath, "utf8"))) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const direct = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {})
  ]);
  return entries.filter((entry) => entry.lockPath.split("/").length <= (entry.name.startsWith("@") ? 3 : 2) && !direct.has(entry.name)).length;
}

function printInstallMetrics(metrics: InstallMetrics, config: TsundereInstallConfig): void {
  const seconds = (metrics.elapsedMs / 1000).toFixed(2);
  const lead = config.themeLogs ? "Tch... " : "";
  console.log(`${lead}dependencies installed in ${seconds}s.`);
  console.log(`Tsundere optimizer: ${metrics.cacheHits} cache ${metrics.cacheHits === 1 ? "hit" : "hits"}, ${metrics.cacheMisses} ${metrics.cacheMisses === 1 ? "miss" : "misses"}, ${metrics.reusedPackages} reused.`);
  console.log(`Tsundere optimizer: ${metrics.linkedPackages} linked, ${metrics.copiedPackages} copied, ${metrics.storedPackages} stored, ${metrics.existingPackages} already present.`);
  if (metrics.corruptEntries > 0) {
    console.log(`Tsundere optimizer: ignored ${metrics.corruptEntries} corrupt cache entr${metrics.corruptEntries === 1 ? "y" : "ies"}.`);
  }
  if (metrics.strictWarnings > 0) {
    console.log(`Tsundere optimizer: strictDependencies noticed ${metrics.strictWarnings} transitive ${metrics.strictWarnings === 1 ? "package" : "packages"} visible at the project root under npm layout.`);
  }
}

function plural(count: number): string {
  return count === 1 ? "" : "es";
}

async function runNpmCommand(args: string[], cwd: string): Promise<number> {
  if (!(await commandExists("npm"))) {
    console.error("npm was not found. Install the Tsundere Runtime prerequisites, then run tsundere doctor again.");
    return 1;
  }
  return runCommand(platformExecutable("npm"), args, { cwd });
}

async function safeRemoveStorePath(storePath: string, target: string): Promise<void> {
  const store = resolve(storePath);
  const resolvedTarget = resolve(target);
  if (isDangerousDeleteTarget(resolvedTarget)) {
    throw new Error(`Refusing to remove broad filesystem path: ${target}`);
  }
  if (resolvedTarget !== store && !resolvedTarget.startsWith(`${store}${sep}`)) {
    throw new Error(`Refusing to remove path outside Tsundere store: ${target}`);
  }
  await rm(resolvedTarget, { recursive: true, force: true });
}

async function safeRemoveProjectHydration(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}

function isDangerousDeleteTarget(target: string): boolean {
  const resolvedHome = resolve(homedir());
  return dirname(target) === target || target === resolvedHome;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
