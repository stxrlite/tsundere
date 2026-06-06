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
  packages: [],
  editorMode: "both",
  updateMode: "notify",
  telemetryMode: "crash",
  telemetryProvider: "disabled",
  telemetryEndpoint: "",
  installResult: undefined,
  existingStatus: undefined
};

const pages = [
  welcomePage,
  packagesPage,
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
  state.packages = (state.meta.packageCatalog || []).map((item) => item.id);
  document.getElementById("version").textContent = `Version ${state.meta.version}`;
  document.getElementById("channel").textContent = `${state.meta.channel} channel`;
  document.getElementById("logo").src = state.meta.logoPath;
  document.getElementById("titleLogo").src = state.meta.logoPath;
  document.getElementById("minimizeWindow").addEventListener("click", () => window.tsundereInstaller.minimize());
  document.getElementById("maximizeWindow").addEventListener("click", () => window.tsundereInstaller.toggleMaximize());
  document.getElementById("closeWindow").addEventListener("click", () => window.tsundereInstaller.close());
  render();
  window.tsundereInstaller.status().then((status) => {
    state.existingStatus = status;
    if (state.page === 0 || state.page === 5 || state.page === 7) {
      render();
    }
  });
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
  stepLabel.textContent = `Step ${Math.min(state.page + 1, pages.length - 1)} of ${pages.length - 1}`;
  title.textContent = page.title;
  subtitle.textContent = page.subtitle;
  content.innerHTML = "";
  page.render();
  back.style.visibility = state.page === 0 || page.disabled ? "hidden" : "visible";
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
welcomePage.title = "Install Tsundere";
welcomePage.subtitle = "A focused setup dashboard for the .yuri toolchain, Discord runtime, editor support, and updater.";
welcomePage.button = "Install";
welcomePage.render = () => {
  content.innerHTML = `
    <div class="dashboard">
      <div class="hero-panel">
        <h3>Ready in minutes</h3>
        <p>Install the CLI, Discord runtime, language tooling, docs, and editor support from one clean app.</p>
        <div class="meta">
          <span>${state.meta.version}</span>
          <span>${state.meta.channel}</span>
        </div>
      </div>
      <div class="stack">
        <div class="status"><strong>Runtime</strong><span>Node-compatible</span></div>
        <div class="status"><strong>Language</strong><span>.yuri projects</span></div>
        <div class="status"><strong>Installed</strong><span>${state.existingStatus?.installed ? "Repair / update mode" : "Fresh install"}</span></div>
      </div>
    </div>
  `;
};

function packagesPage() {}
packagesPage.title = "Package Dashboard";
packagesPage.subtitle = "Choose the Tsundere packages and installer assets you want available after setup.";
packagesPage.render = () => {
  const catalog = state.meta.packageCatalog || [];
  content.innerHTML = `
    <div class="package-list">
      ${catalog.map((pkg) => `
        <label class="package-row">
          <input type="checkbox" data-package="${pkg.id}" ${state.packages.includes(pkg.id) ? "checked" : ""}>
          <span>
            <strong>${pkg.name}</strong>
            <span>${pkg.description}</span>
          </span>
          <span class="package-kind">${pkg.kind}</span>
        </label>
      `).join("")}
    </div>
  `;
  content.querySelectorAll("[data-package]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked && !state.packages.includes(input.dataset.package)) {
        state.packages.push(input.dataset.package);
      }
      if (!input.checked) {
        state.packages = state.packages.filter((item) => item !== input.dataset.package);
      }
    });
  });
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
    <div class="stack" style="margin-top:16px">
      <h3>Telemetry Connector</h3>
      <div class="grid">
        ${radio("telemetryProvider", "disabled", "No Server Yet", "Store the preference locally until Tsundere has a telemetry endpoint.", state.telemetryProvider === "disabled")}
        ${radio("telemetryProvider", "https", "HTTPS Endpoint", "Use a future hosted collector URL.", state.telemetryProvider === "https")}
      </div>
      <input class="path" id="telemetryEndpoint" placeholder="https://telemetry.tsundere.dev/events" value="${state.telemetryEndpoint}">
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
  content.querySelectorAll("input[name='telemetryProvider']").forEach((input) => {
    input.addEventListener("change", () => {
      state.telemetryProvider = input.value;
    });
  });
  document.getElementById("telemetryEndpoint").addEventListener("input", (event) => {
    state.telemetryEndpoint = event.target.value;
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
      ${state.existingStatus ? renderChecks(state.existingStatus.checks) : ""}
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
      <div class="progress"><div id="progressBar"></div></div>
      <p id="installStatus">Starting installation...</p>
      <pre id="installLog"></pre>
    </div>
  `;
  back.style.visibility = "hidden";
  next.disabled = true;
  const dispose = window.tsundereInstaller.onProgress((progress) => {
    document.getElementById("installStatus").textContent = progress.label;
    document.getElementById("progressBar").style.width = `${progress.percent}%`;
  });
  try {
    const result = await window.tsundereInstaller.install({
      installPath: state.installPath,
      components: state.components,
      editorMode: state.editorMode,
      updateMode: state.updateMode,
      telemetryMode: state.telemetryMode,
      telemetryProvider: state.telemetryProvider,
      telemetryEndpoint: state.telemetryEndpoint,
      packages: state.packages
    });
    dispose();
    state.installResult = result;
    document.getElementById("installStatus").textContent = "Installation complete.";
    document.getElementById("progressBar").style.width = "100%";
    document.getElementById("installLog").textContent = result.logs.join("\n\n");
    next.textContent = "Review";
    next.disabled = false;
    installPage.next = async () => {
      state.page = 7;
      render();
    };
  } catch (error) {
    dispose();
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
  const checks = state.installResult?.status?.checks ?? state.existingStatus?.checks ?? [];
  content.innerHTML = `
    <div class="stack">
      <div class="grid">
        <div class="status"><strong>Installed Version</strong><span>${state.meta.version}</span></div>
        <div class="status"><strong>Install Path</strong><span>${state.installPath}</span></div>
      </div>
      ${renderChecks(checks)}
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

function renderChecks(checks = []) {
  if (!checks.length) {
    return "";
  }
  return `
    <div class="checklist">
      ${checks.map((check) => `
        <div class="check-item ${check.ok ? "ok" : ""}">
          <div class="check-dot"></div>
          <div>
            <strong>${check.label}</strong>
            <span>${check.detail}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
