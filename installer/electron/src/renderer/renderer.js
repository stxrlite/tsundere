const state = {
  page: 0,
  meta: {},
  detection: {},
  installPath: "",
  components: {
    cli: true,
    yurils: true,
    editor: true,
    docs: true,
    examples: true
  },
  editorMode: "both",
  updateMode: "notify",
  telemetryMode: "crash"
};

const pages = [
  welcomePage,
  componentsPage,
  editorsPage,
  preferencesPage,
  locationPage,
  installPage,
  completePage
];

const title = document.getElementById("title");
const subtitle = document.getElementById("subtitle");
const stepLabel = document.getElementById("stepLabel");
const content = document.getElementById("content");
const back = document.getElementById("back");
const next = document.getElementById("next");

init();

async function init() {
  state.meta = await window.tsundereInstaller.meta();
  state.installPath = state.meta.defaultInstallPath;
  document.getElementById("version").textContent = `Version ${state.meta.version}`;
  document.getElementById("channel").textContent = `${state.meta.channel} channel`;
  document.getElementById("logo").src = state.meta.logoPath;
  render();
  window.tsundereInstaller.detect().then((result) => {
    state.detection = result;
    if (state.page === 2 || state.page === 4) {
      render();
    }
  });
}

back.addEventListener("click", () => {
  if (state.page > 0) {
    state.page -= 1;
    render();
  }
});

next.addEventListener("click", async () => {
  const page = pages[state.page];
  if (page.next) {
    await page.next();
  } else if (state.page < pages.length - 1) {
    state.page += 1;
    render();
  }
});

function render() {
  const page = pages[state.page];
  stepLabel.textContent = `Step ${Math.min(state.page + 1, 6)} of 6`;
  title.textContent = page.title;
  subtitle.textContent = page.subtitle;
  content.innerHTML = "";
  page.render();
  back.style.visibility = state.page === 0 || state.page === 5 ? "hidden" : "visible";
  next.textContent = page.button || "Next";
  next.disabled = Boolean(page.disabled);
}

function cardCheckbox(key, heading, body) {
  const checked = state.components[key] ? "checked" : "";
  return `
    <label class="option">
      <input type="checkbox" data-component="${key}" ${checked}>
      <span><strong>${heading}</strong><span>${body}</span></span>
    </label>
  `;
}

function wireComponentChecks() {
  content.querySelectorAll("[data-component]").forEach((input) => {
    input.addEventListener("change", () => {
      state.components[input.dataset.component] = input.checked;
    });
  });
}

function radio(name, value, heading, body, checked) {
  return `
    <label class="choice">
      <input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}>
      <strong>${heading}</strong>
      <span>${body}</span>
    </label>
  `;
}

function statusItem(name, value) {
  const installed = value?.installed;
  const detail = installed ? value.version || "Installed" : "Missing";
  return `
    <div class="status">
      <strong>${name}</strong>
      <span class="${installed ? "ok" : "warn"}">${detail}</span>
    </div>
  `;
}

function welcomePage() {}
welcomePage.title = "Welcome to the Tsundere Setup Wizard";
welcomePage.subtitle = "Install the Tsundere language, tooling, and developer ecosystem in just a few minutes.";
welcomePage.button = "Install";
welcomePage.render = () => {
  content.innerHTML = `
    <div class="stack">
      <p>Tsundere installs the CLI, local runtime, YuriLS language server support, editor integration, documentation, and future updater preferences.</p>
      <div class="grid">
        <div class="status"><strong>Release</strong><span>${state.meta.version}</span></div>
        <div class="status"><strong>Channel</strong><span>${state.meta.channel}</span></div>
      </div>
      <p class="pill">Designed for .yuri Discord bot projects with Node.js compatibility underneath.</p>
    </div>
  `;
};

function componentsPage() {}
componentsPage.title = "Choose Components";
componentsPage.subtitle = "Install only what you want. You can add or remove integrations later.";
componentsPage.render = () => {
  content.innerHTML = `
    <div class="grid">
      ${cardCheckbox("cli", "Tsundere CLI", "Project creation, dev server, builds, command sync, package helpers, and runtime tools.")}
      ${cardCheckbox("yurils", "YuriLS Language Server", "Diagnostics, IntelliSense, hover docs, type hints, and Discord-aware editor support.")}
      ${cardCheckbox("editor", "Editor Extensions", "Install the Tsundere extension into VS Code, Cursor, or both.")}
      ${cardCheckbox("docs", "Documentation Pack", "Local documentation, onboarding, examples, and guides.")}
      ${cardCheckbox("examples", "Example Projects", "Starter bots and templates for learning the ecosystem.")}
    </div>
  `;
  wireComponentChecks();
};

function editorsPage() {}
editorsPage.title = "Editor Integrations";
editorsPage.subtitle = "Tsundere can install the VS Code-compatible extension into detected editors.";
editorsPage.render = () => {
  content.innerHTML = `
    <div class="grid">
      ${statusItem("VS Code", state.detection.vscode)}
      ${statusItem("Cursor", state.detection.cursor)}
    </div>
    <div class="stack" style="margin-top:16px">
      ${radio("editor", "both", "Install Both", "Install the extension into VS Code and Cursor when available.", state.editorMode === "both")}
      ${radio("editor", "vscode", "VS Code Only", "Install into VS Code only.", state.editorMode === "vscode")}
      ${radio("editor", "cursor", "Cursor Only", "Install into Cursor only.", state.editorMode === "cursor")}
      ${radio("editor", "skip", "Skip Editor Extensions", "Keep the CLI and docs without editor integration.", state.editorMode === "skip")}
    </div>
  `;
  content.querySelectorAll("input[name='editor']").forEach((input) => {
    input.addEventListener("change", () => {
      state.editorMode = input.value;
    });
  });
};

function preferencesPage() {}
preferencesPage.title = "Updates and Privacy";
preferencesPage.subtitle = "Choose how Tsundere should handle update checks and telemetry preferences.";
preferencesPage.render = () => {
  content.innerHTML = `
    <div class="grid">
      <div class="stack">
        <h3>Update Settings</h3>
        ${radio("update", "auto", "Automatic Checks", "Check GitHub releases once per day.", state.updateMode === "auto")}
        ${radio("update", "notify", "Notify Before Updates", "Check daily and let you decide when to install.", state.updateMode === "notify")}
        ${radio("update", "manual", "Manual Updates Only", "Only check when you run tsundere updater.", state.updateMode === "manual")}
      </div>
      <div class="stack">
        <h3>Telemetry</h3>
        ${radio("telemetry", "usage", "Anonymous Usage Statistics", "Help improve setup and CLI workflows without collecting project code.", state.telemetryMode === "usage")}
        ${radio("telemetry", "crash", "Crash Reports Only", "Only report installer failures and crash metadata.", state.telemetryMode === "crash")}
        ${radio("telemetry", "off", "Disable Telemetry", "Do not send usage or crash information.", state.telemetryMode === "off")}
      </div>
    </div>
  `;
  content.querySelectorAll("input[name='update']").forEach((input) => {
    input.addEventListener("change", () => {
      state.updateMode = input.value;
    });
  });
  content.querySelectorAll("input[name='telemetry']").forEach((input) => {
    input.addEventListener("change", () => {
      state.telemetryMode = input.value;
    });
  });
};

function locationPage() {}
locationPage.title = "Installation Location";
locationPage.subtitle = "Tsundere installs into your user profile and configures PATH access automatically.";
locationPage.render = () => {
  content.innerHTML = `
    <div class="stack">
      <input class="path" id="installPath" value="${state.installPath}">
      <div class="grid">
        ${statusItem("Node.js", state.detection.node)}
        ${statusItem("npm", state.detection.npm)}
        ${statusItem("pnpm", state.detection.pnpm)}
        ${statusItem("Disk Space", { installed: true, version: "About 250 MB" })}
      </div>
      <p class="pill">If Node.js or npm is missing, install Node.js first, then rerun this installer.</p>
    </div>
  `;
  document.getElementById("installPath").addEventListener("input", (event) => {
    state.installPath = event.target.value;
  });
};

function installPage() {}
installPage.title = "Installing Tsundere";
installPage.subtitle = "The installer is configuring the CLI, runtime, editor support, docs, PATH, and updater preferences.";
installPage.button = "Working...";
installPage.disabled = true;
installPage.render = async () => {
  content.innerHTML = `
    <div class="stack">
      <div class="progress"><div></div></div>
      <p id="installStatus">Starting installation...</p>
      <pre id="installLog"></pre>
    </div>
  `;
  back.style.visibility = "hidden";
  next.disabled = true;
  try {
    const result = await window.tsundereInstaller.install({
      installPath: state.installPath,
      components: state.components,
      editorMode: state.editorMode,
      updateMode: state.updateMode,
      telemetryMode: state.telemetryMode
    });
    document.getElementById("installStatus").textContent = "Installation complete.";
    document.getElementById("installLog").textContent = result.logs.join("\n\n");
    setTimeout(() => {
      state.page = 6;
      render();
    }, 700);
  } catch (error) {
    document.getElementById("installStatus").textContent = "Installation failed.";
    document.getElementById("installLog").textContent = error.message || String(error);
    next.textContent = "Retry";
    next.disabled = false;
  }
};
installPage.next = async () => installPage.render();

function completePage() {}
completePage.title = "Tsundere is Ready";
completePage.subtitle = "Installation finished. Start a project, open docs, or join the community.";
completePage.button = "Finish";
completePage.render = () => {
  content.innerHTML = `
    <div class="stack">
      <div class="grid">
        <div class="status"><strong>Installed Version</strong><span>${state.meta.version}</span></div>
        <div class="status"><strong>Install Path</strong><span>${state.installPath}</span></div>
      </div>
      <pre>tsundere create my-bot
tsundere dev
tsundere build</pre>
      <div class="links">
        <button class="primary" data-open="docs">Open Documentation</button>
        <button class="ghost" data-open="github">Open GitHub</button>
        <button class="ghost" data-open="discord">Join Discord</button>
      </div>
    </div>
  `;
  content.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => window.tsundereInstaller.open(button.dataset.open));
  });
};
completePage.next = async () => window.close();
