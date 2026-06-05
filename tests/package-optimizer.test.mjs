import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import {
  cleanStore,
  harvestProjectPackages,
  hydrateCachedPackages,
  optimizedNpmInstall,
  pruneStore,
  resolveInstallConfig,
  syncTsunderePackageFiles
} from "../dist/package-optimizer.js";

test("fresh install runs npm and stores packages", async () => {
  const fixture = await createProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  const code = await optimizedNpmInstall(["install"], {
    cwd: fixture.project,
    config,
    npmRunner: async () => {
      await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "fresh");
      return 0;
    }
  });
  assert.equal(code, 0);
  assert.equal(existsSync(join(fixture.store, "packages", "left-pad")), true);
  await fixture.cleanup();
});

test("install writes Tsundere YAML workspace and lock files", async () => {
  const fixture = await createProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  const code = await optimizedNpmInstall(["install"], {
    cwd: fixture.project,
    config,
    npmRunner: async () => {
      await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "fresh");
      return 0;
    }
  });
  assert.equal(code, 0);
  const workspace = await readFile(join(fixture.project, "tsundere-workspace.yaml"), "utf8");
  const lock = await readFile(join(fixture.project, "tsundere-lock.yaml"), "utf8");
  assert.match(workspace, /packages:\n  - "."/u);
  assert.match(workspace, /packageManager: "npm"/u);
  assert.match(lock, /lockfileVersion: 1/u);
  assert.match(lock, /npmLockfileVersion: 3/u);
  assert.match(lock, /"\/left-pad\/1.0.0":/u);
  assert.match(lock, /integrity: "sha512-test"/u);
  assert.match(lock, /storeKey: "left-pad\/1.0.0\//u);
  await fixture.cleanup();
});

test("cached reinstall reuses package before npm runs", async () => {
  const fixture = await createProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "cached");
  await harvestProjectPackages(fixture.entries(), config);
  await rm(join(fixture.project, "node_modules"), { recursive: true, force: true });
  let sawHydratedPackage = false;
  const code = await optimizedNpmInstall(["install"], {
    cwd: fixture.project,
    config,
    npmRunner: async () => {
      sawHydratedPackage = existsSync(join(fixture.project, "node_modules", "left-pad", "index.js"));
      return 0;
    }
  });
  assert.equal(code, 0);
  assert.equal(sawHydratedPackage, true);
  assert.equal(await readFile(join(fixture.project, "node_modules", "left-pad", "index.js"), "utf8"), "cached\n");
  await fixture.cleanup();
});

test("missing or corrupt cache entry falls back to a miss", async () => {
  const fixture = await createProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "good");
  await harvestProjectPackages(fixture.entries(), config);
  const metadataPath = await findMetadataPath(fixture.store);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, `${JSON.stringify({ ...metadata, directoryHash: "bad" }, null, 2)}\n`, "utf8");
  await rm(join(fixture.project, "node_modules"), { recursive: true, force: true });
  const result = await hydrateCachedPackages(fixture.entries(), config);
  assert.equal(result.reused, 0);
  assert.equal(result.corrupt, 1);
  assert.equal(result.misses, 1);
  await fixture.cleanup();
});

test("windows-style store paths are resolved safely", async () => {
  const cwd = resolve("C:\\workspace\\tsundere-app");
  const config = resolveInstallConfig({ storePath: "C:\\tsundere-cache\\store" }, cwd);
  assert.equal(config.storePath, resolve("C:\\tsundere-cache\\store"));
});

test("copy mode materializes packages without hard links", async () => {
  const fixture = await createProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "copy");
  await harvestProjectPackages(fixture.entries(), config);
  await rm(join(fixture.project, "node_modules"), { recursive: true, force: true });
  const result = await hydrateCachedPackages(fixture.entries(), config);
  assert.equal(result.copied, 1);
  assert.equal(result.linked, 0);
  assert.equal(await readFile(join(fixture.project, "node_modules", "left-pad", "index.js"), "utf8"), "copy\n");
  await fixture.cleanup();
});

test("store prune removes unreferenced entries", async () => {
  const fixture = await createProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "unused");
  await harvestProjectPackages(fixture.entries(), config);
  const result = await pruneStore(config, fixture.project);
  assert.equal(result.removedEntries, 1);
  assert.equal(await findMetadataPath(fixture.store), undefined);
  await fixture.cleanup();
});

test("existing node_modules packages are not overwritten", async () => {
  const fixture = await createProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "store");
  await harvestProjectPackages(fixture.entries(), config);
  await writePackage(join(fixture.project, "node_modules", "left-pad"), "left-pad", "1.0.0", "project");
  const result = await hydrateCachedPackages(fixture.entries(), config);
  assert.equal(result.existing, 1);
  assert.equal(await readFile(join(fixture.project, "node_modules", "left-pad", "index.js"), "utf8"), "project\n");
  await cleanStore(config, fixture.project);
  await fixture.cleanup();
});

test("cli install accepts BOM-prefixed package and config JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsundere-bom-"));
  await writeFile(join(root, "package.json"), `\uFEFF${JSON.stringify({
    name: "bom-fixture",
    version: "1.0.0"
  }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "tsundere.config.json"), `\uFEFF${JSON.stringify({
    name: "bom-fixture",
    source: "src",
    outDir: "build",
    target: "typescript",
    strict: true,
    sourceMaps: true,
    storePath: "./.store",
    linkMode: "copy",
    strictDependencies: false,
    themeLogs: false
  }, null, 2)}\n`, "utf8");
  await mkdir(join(root, "src"), { recursive: true });
  const result = await runCliInstall(root);
  assert.equal(result.code, 0, result.output);
  await rm(root, { recursive: true, force: true });
});

test("workspace packages are mirrored into Tsundere YAML", async () => {
  const fixture = await createWorkspaceProject();
  const config = resolveInstallConfig({ storePath: fixture.store, linkMode: "copy", themeLogs: false }, fixture.project);
  await syncTsunderePackageFiles(fixture.project, config);
  const workspace = await readFile(join(fixture.project, "tsundere-workspace.yaml"), "utf8");
  const lock = await readFile(join(fixture.project, "tsundere-lock.yaml"), "utf8");
  assert.match(workspace, /- "packages\/\*"/u);
  assert.match(lock, /workspace:\n  packages:\n    - "."\n    - "packages\/\*"/u);
  assert.match(lock, /importers:\n  \.:/u);
  assert.match(lock, /"packages\/bot":/u);
  await fixture.cleanup();
});

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), "tsundere-optimizer-"));
  const project = join(root, "project");
  const store = join(root, "store");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    dependencies: {
      "left-pad": "1.0.0"
    }
  }, null, 2)}\n`, "utf8");
  await writeFile(join(project, "package-lock.json"), `${JSON.stringify({
    name: "fixture",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "fixture",
        version: "1.0.0",
        dependencies: {
          "left-pad": "1.0.0"
        }
      },
      "node_modules/left-pad": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz",
        integrity: "sha512-test"
      }
    }
  }, null, 2)}\n`, "utf8");
  return {
    project,
    store,
    entries() {
      return [{
        name: "left-pad",
        version: "1.0.0",
        integrity: "sha512-test",
        lockPath: "node_modules/left-pad",
        diskPath: join(project, "node_modules", "left-pad"),
        direct: true
      }];
    },
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
}

async function createWorkspaceProject() {
  const root = await mkdtemp(join(tmpdir(), "tsundere-workspace-"));
  const project = join(root, "project");
  const store = join(root, "store");
  await mkdir(join(project, "packages", "bot"), { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({
    name: "workspace-fixture",
    version: "1.0.0",
    packageManager: "npm@10.0.0",
    workspaces: ["packages/*"],
    dependencies: {
      "left-pad": "1.0.0"
    }
  }, null, 2)}\n`, "utf8");
  await writeFile(join(project, "package-lock.json"), `${JSON.stringify({
    name: "workspace-fixture",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "workspace-fixture",
        version: "1.0.0",
        dependencies: {
          "left-pad": "1.0.0"
        }
      },
      "packages/bot": {
        name: "bot",
        version: "1.0.0",
        dependencies: {
          "left-pad": "1.0.0"
        }
      },
      "node_modules/left-pad": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz",
        integrity: "sha512-test"
      }
    }
  }, null, 2)}\n`, "utf8");
  return {
    project,
    store,
    cleanup() {
      return rm(root, { recursive: true, force: true });
    }
  };
}

async function writePackage(path, name, version, contents) {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "package.json"), `${JSON.stringify({ name, version }, null, 2)}\n`, "utf8");
  await writeFile(join(path, "index.js"), `${contents}\n`, "utf8");
}

async function findMetadataPath(store) {
  const root = join(store, "packages");
  if (!existsSync(root)) {
    return undefined;
  }
  return findMetadataPathInner(root);
}

async function findMetadataPathInner(path) {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isFile() && entry.name === "metadata.json") {
      return child;
    }
    if (entry.isDirectory()) {
      const found = await findMetadataPathInner(child);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

async function runCliInstall(cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [resolve("dist", "cli.js"), "install"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolvePromise({ code, output });
    });
    child.on("error", (error) => {
      resolvePromise({ code: 1, output: String(error) });
    });
  });
}
