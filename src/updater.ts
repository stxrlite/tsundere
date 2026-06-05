import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      assets: Array.isArray(json.assets) ? json.assets : []
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
