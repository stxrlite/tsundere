const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const version = app.getVersion();
const channel = process.env.TSUNDERE_RELEASE_CHANNEL || "stable";

function resourcePath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.resolve(__dirname, "..", "..", "..", ...parts);
}

function payloadPath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "payload", ...parts)
    : path.resolve(__dirname, "..", "..", "..", "release", ...parts);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#151018",
    title: "Tsundere Setup",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("installer:meta", () => ({
  version,
  channel,
  defaultInstallPath: path.join(os.homedir(), "AppData", "Local", "Tsundere"),
  logoPath: pathToFileURL(resourcePath("assets", "tsundere-logo.png")).toString()
}));

ipcMain.handle("installer:detect", async () => ({
  node: await commandStatus("node", ["--version"]),
  npm: await commandStatus("npm", ["--version"]),
  pnpm: await commandStatus("pnpm", ["--version"]),
  vscode: await commandStatus("code", ["--version"]),
  cursor: await commandStatus("cursor", ["--version"])
}));

ipcMain.handle("installer:install", async (_event, options) => {
  const logs = [];
  const installRoot = options.installPath || path.join(os.homedir(), "AppData", "Local", "Tsundere");
  const configRoot = path.join(os.homedir(), "AppData", "Roaming", "Tsundere");
  const binRoot = path.join(installRoot, "bin");
  fs.mkdirSync(installRoot, { recursive: true });
  fs.mkdirSync(configRoot, { recursive: true });
  fs.mkdirSync(binRoot, { recursive: true });

  const cliAsset = findFirst(payloadPath(), /^tsundere-cli.*\.tgz$/i);
  if (options.components.cli && cliAsset) {
    logs.push(await run("npm", ["install", "-g", cliAsset]));
  }

  const vsix = findFirst(payloadPath(), /^vscode-tsundere.*\.vsix$/i);
  if (options.components.editor && vsix && (options.editorMode === "both" || options.editorMode === "vscode")) {
    logs.push(await run("code", ["--install-extension", vsix, "--force"], { optional: true }));
  }
  if (options.components.editor && vsix && (options.editorMode === "both" || options.editorMode === "cursor")) {
    logs.push(await run("cursor", ["--install-extension", vsix, "--force"], { optional: true }));
  }

  const docsSource = resourcePath("docs");
  if (options.components.docs && fs.existsSync(docsSource)) {
    copyDir(docsSource, path.join(installRoot, "docs"));
  }

  const uninstallSource = resourcePath("scripts", "TsundereUninstall.ps1");
  if (fs.existsSync(uninstallSource)) {
    fs.copyFileSync(uninstallSource, path.join(installRoot, "uninstall.ps1"));
  }

  await addUserPath(binRoot);
  writeInstallerConfig(configRoot, installRoot, options);
  registerUninstaller(installRoot);

  if (options.updateMode !== "manual") {
    await run("schtasks", [
      "/Create",
      "/SC",
      "DAILY",
      "/TN",
      "Tsundere Daily Update Check",
      "/TR",
      "\"tsundere\" updater check",
      "/ST",
      "10:00",
      "/F"
    ], { optional: true });
  }

  return { ok: true, logs };
});

ipcMain.handle("installer:open", (_event, target) => {
  const targets = {
    docs: "https://tsundere.dev",
    github: "https://github.com/TsundereLang/tsundere",
    discord: "https://discord.gg/Gpxj5xVXBZ"
  };
  return shell.openExternal(targets[target] || target);
});

function commandStatus(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: true });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve({ installed: false, version: "" }));
    child.on("close", (code) => {
      resolve({ installed: code === 0, version: output.split(/\r?\n/)[0] || "" });
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: true });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      error += chunk.toString();
    });
    child.on("error", (err) => {
      if (options.optional) {
        resolve(`${command}: skipped (${err.message})`);
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (code === 0 || options.optional) {
        resolve(`${command}: ${output || error || `exit ${code}`}`.trim());
      } else {
        reject(new Error(`${command} exited with code ${code}: ${error || output}`));
      }
    });
  });
}

function findFirst(root, pattern) {
  if (!fs.existsSync(root)) {
    return undefined;
  }
  return fs.readdirSync(root)
    .map((entry) => path.join(root, entry))
    .find((entry) => pattern.test(path.basename(entry)));
}

function copyDir(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

async function addUserPath(entry) {
  const current = process.env.PATH || "";
  if (!current.toLowerCase().split(";").includes(entry.toLowerCase())) {
    const next = `${current};${entry}`;
    await run("setx", ["Path", next], { optional: true });
  }
}

function writeInstallerConfig(configRoot, installRoot, options) {
  const config = {
    version,
    channel,
    installRoot,
    updateMode: options.updateMode,
    telemetryMode: options.telemetryMode,
    installedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(configRoot, "installer.json"), JSON.stringify(config, null, 2));
}

function registerUninstaller(installRoot) {
  const uninstall = path.join(installRoot, "uninstall.ps1");
  const reg = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Tsundere";
  spawn("reg", ["add", reg, "/f"], { shell: true });
  spawn("reg", ["add", reg, "/v", "DisplayName", "/t", "REG_SZ", "/d", "Tsundere", "/f"], { shell: true });
  spawn("reg", ["add", reg, "/v", "DisplayVersion", "/t", "REG_SZ", "/d", version, "/f"], { shell: true });
  spawn("reg", ["add", reg, "/v", "Publisher", "/t", "REG_SZ", "/d", "TsundereLang", "/f"], { shell: true });
  spawn("reg", ["add", reg, "/v", "UninstallString", "/t", "REG_SZ", "/d", `powershell -ExecutionPolicy Bypass -File "${uninstall}"`, "/f"], { shell: true });
}
