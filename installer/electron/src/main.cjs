const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { createTelemetry } = require("./telemetry.cjs");

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
    frame: false,
    icon: resourcePath("assets", "tsundere-installer-logo.png"),
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
  logoPath: pathToFileURL(resourcePath("assets", "tsundere-installer-logo.png")).toString(),
  packageCatalog: [
    { id: "cli", name: "Tsundere CLI", kind: "Core", description: "Build, run, update, and manage .yuri projects." },
    { id: "discord", name: "@tsundere/discord", kind: "Runtime", description: "Bundled Discord wrapper and runtime library." },
    { id: "yurils", name: "YuriLS", kind: "Editor", description: "Language server metadata, diagnostics, and IntelliSense support." },
    { id: "vscode", name: "VS Code Extension", kind: "Editor", description: "Syntax highlighting, commands, snippets, and Discord completions." },
    { id: "docs", name: "Documentation Pack", kind: "Docs", description: "Local guides, templates, examples, and migration notes." },
    { id: "examples", name: "Example Projects", kind: "Templates", description: "Starter Discord bot and backend templates." },
    { id: "powershell", name: "PowerShell Installer", kind: "Fallback", description: "Script installer for users who do not want the EXE." },
    { id: "linux", name: "Linux Installer", kind: "Fallback", description: "Shell installer included in release bundles." }
  ]
}));

ipcMain.handle("installer:detect", async () => ({
  node: await commandStatus("node", ["--version"]),
  npm: await commandStatus("npm", ["--version"]),
  pnpm: await commandStatus("pnpm", ["--version"]),
  vscode: await commandStatus("code", ["--version"]),
  cursor: await commandStatus("cursor", ["--version"])
}));

ipcMain.handle("installer:status", async () => installStatus());

ipcMain.handle("installer:install", async (event, options) => {
  const logs = [];
  const installRoot = options.installPath || path.join(os.homedir(), "AppData", "Local", "Tsundere");
  const configRoot = path.join(os.homedir(), "AppData", "Roaming", "Tsundere");
  const binRoot = path.join(installRoot, "bin");
  const telemetry = createTelemetry(configRoot, { ...options, version, channel });
  const progress = (percent, label) => event.sender.send("installer:progress", { percent, label });
  progress(5, "Checking existing installation...");
  await telemetry.capture("install_started", { components: options.components, packages: options.packages });
  fs.mkdirSync(installRoot, { recursive: true });
  fs.mkdirSync(configRoot, { recursive: true });
  fs.mkdirSync(binRoot, { recursive: true });

  progress(12, "Preparing uninstaller and folders...");
  const uninstallSource = resourcePath("scripts", "TsundereUninstall.ps1");
  if (fs.existsSync(uninstallSource)) {
    fs.copyFileSync(uninstallSource, path.join(installRoot, "uninstall.ps1"));
  }

  const cliAsset = findFirst(payloadPath(), /^tsundere-cli.*\.tgz$/i);
  if (options.components.cli && cliAsset) {
    progress(28, "Installing Tsundere CLI...");
    logs.push(await run("npm", ["install", "-g", cliAsset]));
  } else {
    logs.push("Tsundere CLI package was not selected or not found in the payload.");
  }

  const vsix = findFirst(payloadPath(), /^vscode-tsundere.*\.vsix$/i);
  if (options.components.editor && vsix && (options.editorMode === "both" || options.editorMode === "vscode")) {
    progress(46, "Installing VS Code extension...");
    logs.push(await run("code", ["--install-extension", vsix, "--force"], { optional: true }));
  }
  if (options.components.editor && vsix && (options.editorMode === "both" || options.editorMode === "cursor")) {
    progress(56, "Installing Cursor extension...");
    logs.push(await run("cursor", ["--install-extension", vsix, "--force"], { optional: true }));
  }

  const docsSource = resourcePath("docs");
  if (options.components.docs && fs.existsSync(docsSource)) {
    progress(68, "Installing local documentation...");
    copyDir(docsSource, path.join(installRoot, "docs"));
  }

  progress(78, "Configuring PATH and preferences...");
  await addUserPath(binRoot);
  writeInstallerConfig(configRoot, installRoot, options);
  registerUninstaller(installRoot);

  if (options.updateMode !== "manual") {
    progress(88, "Scheduling update checks...");
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

  progress(96, "Verifying installation...");
  const status = await installStatus(installRoot);
  await telemetry.capture("install_completed", { installRoot });
  progress(100, status.ready ? "Installation verified." : "Installation repaired. Review missing items.");
  return { ok: true, logs, status };
});

ipcMain.handle("installer:open", (_event, target) => {
  const targets = {
    docs: "https://tsundere.dev",
    github: "https://github.com/TsundereLang/tsundere",
    discord: "https://discord.gg/Gpxj5xVXBZ"
  };
  return shell.openExternal(targets[target] || target);
});

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:toggleMaximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

function commandStatus(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: true, windowsHide: true });
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
    const child = spawn(command, args, { shell: true, windowsHide: true });
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
    telemetry: {
      provider: options.telemetryProvider || "disabled",
      endpoint: options.telemetryEndpoint || "",
      crashReports: options.telemetryMode === "crash" || options.telemetryMode === "usage",
      usageStats: options.telemetryMode === "usage"
    },
    packages: options.packages || [],
    installedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(configRoot, "installer.json"), JSON.stringify(config, null, 2));
}

function registerUninstaller(installRoot) {
  const uninstall = path.join(installRoot, "uninstall.ps1");
  const reg = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Tsundere";
  spawn("reg", ["add", reg, "/f"], { shell: true, windowsHide: true });
  spawn("reg", ["add", reg, "/v", "DisplayName", "/t", "REG_SZ", "/d", "Tsundere", "/f"], { shell: true, windowsHide: true });
  spawn("reg", ["add", reg, "/v", "DisplayVersion", "/t", "REG_SZ", "/d", version, "/f"], { shell: true, windowsHide: true });
  spawn("reg", ["add", reg, "/v", "Publisher", "/t", "REG_SZ", "/d", "TsundereLang", "/f"], { shell: true, windowsHide: true });
  spawn("reg", ["add", reg, "/v", "UninstallString", "/t", "REG_SZ", "/d", `powershell -ExecutionPolicy Bypass -File "${uninstall}"`, "/f"], { shell: true, windowsHide: true });
}

async function installStatus(installRoot = path.join(os.homedir(), "AppData", "Local", "Tsundere")) {
  const configRoot = path.join(os.homedir(), "AppData", "Roaming", "Tsundere");
  const uninstall = path.join(installRoot, "uninstall.ps1");
  const docs = path.join(installRoot, "docs");
  const config = path.join(configRoot, "installer.json");
  const cli = await commandStatus("tsundere", ["version"]);
  const pathReady = (process.env.PATH || "").toLowerCase().includes(path.join(installRoot, "bin").toLowerCase());
  const checks = [
    { id: "cli", label: "Tsundere CLI", ok: cli.installed, detail: cli.version || "Not found" },
    { id: "uninstaller", label: "Uninstaller", ok: fs.existsSync(uninstall), detail: uninstall },
    { id: "config", label: "Installer config", ok: fs.existsSync(config), detail: config },
    { id: "docs", label: "Local docs", ok: fs.existsSync(docs), detail: docs },
    { id: "path", label: "PATH entry", ok: pathReady, detail: path.join(installRoot, "bin") }
  ];
  return {
    installed: fs.existsSync(installRoot) || cli.installed,
    ready: checks.every((check) => check.ok),
    installRoot,
    checks
  };
}
