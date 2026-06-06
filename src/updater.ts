import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { platformExecutable, runCommand } from "./platform/index.js";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface TsundereRelease {
  version: string;
  tag: string;
  url: string;
  assets: ReleaseAsset[];
  body?: string;
}

export interface SelfUpdateOptions {
  currentVersion: string;
  repo: string;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  installCommand?: (packagePath: string) => Promise<number>;
}

export interface SelfUpdateResult {
  code: number;
  changed: boolean;
  release?: TsundereRelease;
  asset?: ReleaseAsset;
  message: string;
}

export interface UpdateScheduleOptions {
  action: "install" | "remove" | "status";
  cliPath: string;
  time?: string;
}

export async function latestRelease(repo: string, currentVersion = "0.0.0", fetchImpl: typeof fetch = fetch): Promise<TsundereRelease | undefined> {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": `tsundere-cli/${currentVersion}`
      }
    });
    if (!response.ok) {
      return undefined;
    }
    const json = await response.json() as { tag_name?: string; html_url?: string; assets?: ReleaseAsset[] };
    const version = normalizeVersion(json.tag_name ?? "");
    if (!version) {
      return undefined;
    }
    return {
      version,
      tag: json.tag_name ?? `v${version}`,
      url: json.html_url ?? `https://github.com/${repo}/releases/latest`,
      assets: Array.isArray(json.assets) ? json.assets : [],
      body: typeof (json as { body?: unknown }).body === "string" ? (json as { body: string }).body : ""
    };
  } catch {
    return undefined;
  }
}

export async function selfUpdate(options: SelfUpdateOptions): Promise<SelfUpdateResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const release = await latestRelease(options.repo, options.currentVersion, fetchImpl);
  if (!release) {
    return {
      code: 1,
      changed: false,
      message: "Could not read the latest release. Check your network connection or TSUNDERE_UPDATE_REPO."
    };
  }

  if (!options.force && compareVersions(release.version, options.currentVersion) <= 0) {
    return {
      code: 0,
      changed: false,
      release,
      message: "You are already on the latest known version."
    };
  }

  const asset = selectCliAsset(release.assets);
  if (!asset) {
    return {
      code: 1,
      changed: false,
      release,
      message: "Latest release is missing a tsundere-cli tarball asset."
    };
  }

  if (options.dryRun) {
    return {
      code: 0,
      changed: false,
      release,
      asset,
      message: `Dry run: would install ${asset.name} from ${release.url}.`
    };
  }

  if (!options.yes) {
    return {
      code: 1,
      changed: false,
      release,
      asset,
      message: `Update available: ${options.currentVersion} -> ${release.version}. Run tsundere updater self --yes to install it automatically.`
    };
  }

  const packagePath = await downloadAsset(asset, fetchImpl);
  try {
    const code = await (options.installCommand ?? installCliPackage)(packagePath);
    return {
      code,
      changed: code === 0,
      release,
      asset,
      message: code === 0
        ? `Tch... updated Tsundere to ${release.version}.`
        : `Tsundere update installer exited with code ${code}.`
    };
  } finally {
    await rm(packagePath, { force: true }).catch(() => undefined);
  }
}

export function selectCliAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  return assets.find((asset) => /^tsundere-cli-\d+\.\d+\.\d+.*\.tgz$/iu.test(asset.name))
    ?? assets.find((asset) => asset.name === "tsundere-cli.tgz")
    ?? assets.find((asset) => /^tsundere-cli.*\.tgz$/iu.test(asset.name));
}

export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/iu, "");
}

export function compareVersions(a: string, b: string): number {
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

async function downloadAsset(asset: ReleaseAsset, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(asset.browser_download_url, {
    headers: {
      "User-Agent": "tsundere-updater"
    }
  });
  if (!response.ok || !response.arrayBuffer) {
    throw new Error(`Failed to download update asset: ${asset.name}`);
  }
  const temp = await mkdtemp(join(tmpdir(), "tsundere-update-"));
  const packagePath = join(temp, asset.name);
  await writeFile(packagePath, Buffer.from(await response.arrayBuffer()));
  return packagePath;
}

async function installCliPackage(packagePath: string): Promise<number> {
  return runCommand(platformExecutable("npm"), ["install", "-g", packagePath]);
}

export async function securityUpdateNotice(currentVersion: string, repo: string, fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const cacheFile = join(homedir(), ".tsundere", "security-update-cache.json");
  const cached = await readSecurityCache(cacheFile);
  const now = Date.now();
  if (cached && now - cached.checkedAt < 24 * 60 * 60 * 1000) {
    return cached.message;
  }
  const release = await latestRelease(repo, currentVersion, fetchImpl);
  let message: string | undefined;
  if (release && compareVersions(release.version, currentVersion) > 0 && isSecurityRelease(release)) {
    message = `Security update available: Tsundere ${currentVersion} -> ${release.version}. Run tsundere updater self --yes.`;
  }
  await writeSecurityCache(cacheFile, message ? { checkedAt: now, message } : { checkedAt: now });
  return message;
}

function isSecurityRelease(release: TsundereRelease): boolean {
  const text = `${release.tag}\n${release.version}\n${release.body ?? ""}`.toLowerCase();
  return /\b(security|critical|vulnerability|cve-|exploit|hotfix|patch now)\b/u.test(text);
}

async function readSecurityCache(file: string): Promise<{ checkedAt: number; message?: string } | undefined> {
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(await readFile(file, "utf8")) as { checkedAt: number; message?: string };
  } catch {
    return undefined;
  }
}

async function writeSecurityCache(file: string, value: { checkedAt: number; message?: string }): Promise<void> {
  await mkdir(dirname(file), { recursive: true }).catch(() => undefined);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8").catch(() => undefined);
}

export async function configureDailyUpdateCheck(options: UpdateScheduleOptions): Promise<number> {
  if (process.platform === "win32") {
    return configureWindowsUpdateTask(options);
  }
  return configureUnixUpdateCron(options);
}

async function configureWindowsUpdateTask(options: UpdateScheduleOptions): Promise<number> {
  const taskName = "Tsundere Daily Update Check";
  if (options.action === "status") {
    return runCommand("schtasks", ["/Query", "/TN", taskName]);
  }
  if (options.action === "remove") {
    return runCommand("schtasks", ["/Delete", "/TN", taskName, "/F"]);
  }
  const time = options.time ?? "10:00";
  const node = platformExecutable("node");
  const command = `"${node}" "${options.cliPath}" updater check`;
  return runCommand("schtasks", [
    "/Create",
    "/SC",
    "DAILY",
    "/TN",
    taskName,
    "/TR",
    command,
    "/ST",
    time,
    "/F"
  ]);
}

async function configureUnixUpdateCron(options: UpdateScheduleOptions): Promise<number> {
  const marker = "# tsundere-daily-update-check";
  const line = `0 10 * * * ${platformExecutable("node")} "${options.cliPath}" updater check ${marker}`;
  const current = await readCurrentCrontab();
  const filtered = current
    .split(/\r?\n/u)
    .filter((entry) => entry.trim() && !entry.includes(marker));
  if (options.action === "status") {
    console.log(current.includes(marker) ? "Tsundere daily update check is installed." : "Tsundere daily update check is not installed.");
    return 0;
  }
  const next = options.action === "install" ? [...filtered, line] : filtered;
  const temp = join(tmpdir(), `tsundere-cron-${Date.now()}.txt`);
  await writeFile(temp, `${next.join("\n")}\n`, "utf8");
  try {
    return runCommand("crontab", [temp]);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

async function readCurrentCrontab(): Promise<string> {
  const temp = join(tmpdir(), `tsundere-cron-current-${Date.now()}.txt`);
  const code = await runCommand("sh", ["-c", `crontab -l > "${temp}" 2>/dev/null || true`]);
  if (code !== 0) {
    return "";
  }
  try {
    return await readFile(temp, "utf8");
  } catch {
    return "";
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}
