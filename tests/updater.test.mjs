import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, latestRelease, selectCliAsset, selfUpdate } from "../dist/updater.js";

const asset = {
  name: "tsundere-cli-0.1.2.tgz",
  browser_download_url: "https://example.test/tsundere-cli-0.1.2.tgz"
};

function releaseFetch(version = "v0.1.2", assets = [asset]) {
  return async (url) => {
    assert.match(String(url), /api\.github\.com/u);
    return {
      ok: true,
      async json() {
        return {
          tag_name: version,
          html_url: "https://github.com/TsundereLang/tsundere/releases/tag/v0.1.2",
          assets
        };
      }
    };
  };
}

function downloadFetch() {
  let requests = 0;
  return {
    fetch: async (url) => {
      requests += 1;
      if (String(url).includes("api.github.com")) {
        return {
          ok: true,
          async json() {
            return {
              tag_name: "v0.1.2",
              html_url: "https://github.com/TsundereLang/tsundere/releases/tag/v0.1.2",
              assets: [asset]
            };
          }
        };
      }
      return {
        ok: true,
        async arrayBuffer() {
          return new TextEncoder().encode("package").buffer;
        }
      };
    },
    requests: () => requests
  };
}

test("compares release versions with v prefixes", () => {
  assert.equal(compareVersions("v0.1.2", "0.1.1"), 1);
  assert.equal(compareVersions("0.1.1", "v0.1.1"), 0);
  assert.equal(compareVersions("0.1.0", "0.1.1"), -1);
});

test("selects the versioned Tsundere CLI asset first", () => {
  const selected = selectCliAsset([
    { name: "Tsundere-v0.1.2.zip", browser_download_url: "https://example.test/release.zip" },
    { name: "tsundere-cli.tgz", browser_download_url: "https://example.test/legacy.tgz" },
    asset
  ]);
  assert.equal(selected, asset);
});

test("reads latest GitHub release metadata", async () => {
  const release = await latestRelease("TsundereLang/tsundere", "0.1.1", releaseFetch());
  assert.equal(release?.version, "0.1.2");
  assert.equal(release?.tag, "v0.1.2");
  assert.equal(release?.assets[0]?.name, "tsundere-cli-0.1.2.tgz");
});

test("self update dry run does not install", async () => {
  const result = await selfUpdate({
    currentVersion: "0.1.1",
    repo: "TsundereLang/tsundere",
    dryRun: true,
    yes: true,
    fetchImpl: releaseFetch()
  });
  assert.equal(result.code, 0);
  assert.equal(result.changed, false);
  assert.match(result.message, /Dry run/u);
  assert.equal(result.asset?.name, "tsundere-cli-0.1.2.tgz");
});

test("self update requires explicit yes for install", async () => {
  const result = await selfUpdate({
    currentVersion: "0.1.1",
    repo: "TsundereLang/tsundere",
    fetchImpl: releaseFetch()
  });
  assert.equal(result.code, 1);
  assert.equal(result.changed, false);
  assert.match(result.message, /--yes/u);
});

test("self update installs downloaded tarball when yes is set", async () => {
  const fake = downloadFetch();
  const installed = [];
  const result = await selfUpdate({
    currentVersion: "0.1.1",
    repo: "TsundereLang/tsundere",
    yes: true,
    fetchImpl: fake.fetch,
    installCommand: async (packagePath) => {
      installed.push(packagePath);
      return 0;
    }
  });
  assert.equal(result.code, 0);
  assert.equal(result.changed, true);
  assert.equal(installed.length, 1);
  assert.match(installed[0], /tsundere-cli-0\.1\.2\.tgz$/u);
  assert.equal(fake.requests(), 2);
});

test("self update reports releases without CLI tarballs", async () => {
  const result = await selfUpdate({
    currentVersion: "0.1.1",
    repo: "TsundereLang/tsundere",
    yes: true,
    fetchImpl: releaseFetch("v0.1.2", [{ name: "Tsundere-v0.1.2.zip", browser_download_url: "https://example.test/release.zip" }])
  });
  assert.equal(result.code, 1);
  assert.equal(result.changed, false);
  assert.match(result.message, /missing/u);
});
