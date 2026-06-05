const storedTheme = localStorage.getItem("tsundere-theme");
if (storedTheme === "dark") {
  document.documentElement.classList.add("dark");
}
if (storedTheme === "light") {
  document.documentElement.classList.add("light");
}

window.addEventListener("DOMContentLoaded", () => {
  const lucide = document.createElement("script");
  lucide.src = "https://unpkg.com/lucide@latest/dist/umd/lucide.min.js";
  lucide.onload = () => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  };
  document.head.appendChild(lucide);

  const nav = document.querySelector("aside nav");
  if (nav) {
    const search = document.createElement("div");
    search.className = "docs-search";
    search.innerHTML = `
      <i data-lucide="search" class="search-icon"></i>
      <input id="docs-search-input" type="search" placeholder="Search docs">
      <div id="docs-search-results" class="search-results"></div>
    `;
    nav.parentElement?.insertBefore(search, nav);

    const links = [
      ["templates.html", "Templates"],
      ["examples.html", "Examples"],
      ["transition.html", "Transition"],
      ["versions.html", "Versions"]
    ];
    const current = location.pathname.split("/").pop();
    for (const [href, label] of links) {
      if (nav.querySelector(`a[href="${href}"]`)) {
        continue;
      }
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label;
      link.className = current === href
        ? "block rounded-md bg-pink-100 px-3 py-2 font-medium text-pink-800"
        : "block rounded-md px-3 py-2 text-slate-700 hover:bg-white";
      nav.appendChild(link);
    }

    addDiscordDropdown(nav);
    addRoadmapDropdown(nav);
  }

  addAuthor();
  setupSearch();

  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";
  button.innerHTML = document.documentElement.classList.contains("dark")
    ? '<i data-lucide="sun"></i><span>Light</span>'
    : '<i data-lucide="moon"></i><span>Dark</span>';
  button.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    document.documentElement.classList.remove("light");
    localStorage.setItem("tsundere-theme", isDark ? "dark" : "light");
    if (!isDark) {
      document.documentElement.classList.add("light");
    }
    button.innerHTML = isDark ? '<i data-lucide="sun"></i><span>Light</span>' : '<i data-lucide="moon"></i><span>Dark</span>';
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });
  document.body.appendChild(button);
});

function addAuthor() {
  const main = document.querySelector("main");
  const title = main?.querySelector("h1");
  if (!main || !title || main.querySelector(".doc-author")) {
    return;
  }
  const author = document.createElement("div");
  author.className = "doc-author";
  author.innerHTML = `
    <img src="https://cdn.discordapp.com/avatars/1212798448525512785/3939e4e22234f3e7ce8247988ad43d3d.webp?size=1536" alt="Luckyz">
    <span>Written by <strong>Luckyz</strong></span>
  `;
  title.insertAdjacentElement("afterend", author);
}

function addDiscordDropdown(nav) {
  if (nav.querySelector(".docs-dropdown")) {
    return;
  }
  const current = location.pathname.split("/").pop();
  const isDiscordPage = current === "discord.html" || current === "discord-events.html" || current === "discord-layouts.html";
  const details = document.createElement("details");
  details.className = isDiscordPage ? "docs-dropdown active" : "docs-dropdown";
  details.open = isDiscordPage;
  details.innerHTML = `
    <summary>Discord Guide</summary>
    <a href="discord.html" class="${current === "discord.html" ? "active" : ""}">Overview</a>
    <a href="discord-events.html" class="${current === "discord-events.html" ? "active" : ""}">Events</a>
    <a href="discord-layouts.html" class="${current === "discord-layouts.html" ? "active" : ""}">Layouts</a>
  `;
  const discordLink = nav.querySelector('a[href="discord.html"]');
  discordLink?.replaceWith(details);
}

function addRoadmapDropdown(nav) {
  if (nav.querySelector(".roadmap-dropdown")) {
    return;
  }
  const current = location.pathname.split("/").pop();
  const pages = new Set(["roadmap.html", "protect.html", "discord-intelligence.html", "visualizer.html", "plugins.html"]);
  const isRoadmapPage = pages.has(current);
  const details = document.createElement("details");
  details.className = isRoadmapPage ? "docs-dropdown roadmap-dropdown active" : "docs-dropdown roadmap-dropdown";
  details.open = isRoadmapPage;
  details.innerHTML = `
    <summary>Roadmap</summary>
    <a href="roadmap.html" class="${current === "roadmap.html" ? "active" : ""}">Overview</a>
    <a href="protect.html" class="${current === "protect.html" ? "active" : ""}">Protect</a>
    <a href="discord-intelligence.html" class="${current === "discord-intelligence.html" ? "active" : ""}">Discord Intelligence</a>
    <a href="visualizer.html" class="${current === "visualizer.html" ? "active" : ""}">Visualizer</a>
    <a href="plugins.html" class="${current === "plugins.html" ? "active" : ""}">Plugins</a>
  `;
  nav.appendChild(details);
}

const docsIndex = [
  {
    href: "index.html",
    title: "Overview",
    text: "Tsundere is a TypeScript-style .yuri language toolchain and optimized Discord wrapper for Node.js. It has a local runtime, bundled @tsundere/discord package, command discovery, local docs, examples, templates, light mode, dark mode, search, and version-aware updater support. Use it for Discord bots when you want familiar code with cleaner bot workflow."
  },
  {
    href: "getting-started.html",
    title: "Getting Started",
    text: "Install Tsundere from a release zip with install-tsundere.ps1. Create projects with tsundere create my-bot --template discord. Run tsundere install and tsundere dev. Add DISCORD_TOKEN to .env. Existing projects that cannot resolve @tsundere/discord should run tsundere runtime install and tsundere install."
  },
  {
    href: "discord.html",
    title: "Discord Guide",
    text: "Discord guide covers Client setup, Intents, Guilds, GuildMessages, MessageContent, slash commands, interactions, buttons, selects, modals, embeds, Component.define, typed component data, command discovery config, route based commands, event layouts, and Discord diagnostics for custom IDs and embed limits."
  },
  {
    href: "discord-layouts.html",
    title: "Discord Layouts",
    text: "Discord layouts explain recommended Tsundere project structure with src main.yuri, events, commands, components, modals, services, small main files, event files, command files, route-based commands, routeBased false, groups, interaction router style, button handlers, modal handlers, and command discovery."
  },
  {
    href: "discord-events.html",
    title: "Discord Events",
    text: "Discord events include ready, interactionCreate, messageCreate, messageUpdate, messageDelete, guildCreate, guildDelete, guildMemberAdd, guildMemberRemove, guildBanAdd, guildBanRemove, channelCreate, channelUpdate, channelDelete, roleCreate, roleUpdate, roleDelete, voiceStateUpdate, threadCreate, threadUpdate, threadDelete, error, warn, debug, shardReady, shardDisconnect, and shardReconnecting. Event docs explain callback data, intent hints, parameters, MessageContent, GuildMembers, GuildVoiceStates, GuildModeration, cache behavior, partial messages, audit logs, voice states, and shard health."
  },
  {
    href: "cli.html",
    title: "CLI and Runtime",
    text: "CLI commands include tsundere create, install, update package, dev, build, start, version, updater, commands sync, types sync, docs, runtime install, lint, format, test, doctor, plugin install, store path, store prune, and cache clean. Runtime flow compiles .yuri into build and emits runnable JavaScript into .tsundere/runtime-build. tsundere start runs main.js through Node. tsundere dev watches and restarts."
  },
  {
    href: "templates.html",
    title: "Templates",
    text: "Templates include discord, rest, websocket, microservice, cli, and empty. The Discord template creates src/main.yuri, src/commands/ping.yuri, tsundere.config.json, .env.example, package.json, .gitignore, and .tsundere/runtime/discord. Templates are small starting points and not hidden bot frameworks."
  },
  {
    href: "examples.html",
    title: "Examples",
    text: "Examples live in docs/examples. Example files include starter-bot.yuri, embeds.yuri, components.yuri, collectors.yuri, modal-flow.yuri, slash-options.yuri, typed-router.yuri, cache-and-helpers.yuri, prefix-utils.yuri, rest-commands.yuri, sharding-and-gateway.yuri, webhook-thread-audit.yuri, and command examples for ping, avatar, and admin ban."
  },
  {
    href: "transition.html",
    title: "Transition to Yuri",
    text: "Transition to Yuri explains how JavaScript and Python developers should write Tsundere code. It covers imports, events, client.on, client.once, Slash.command, interaction replies, command discovery, builders, Discord layouts, runtime commands, tsundere dev, build, start, and how Yuri is not a one to one JavaScript copy."
  },
  {
    href: "updates.html",
    title: "Updates",
    text: "Updates explain linux-testing branch work, npm-first package optimizer, tsundere store path, cache clean, plugin install, GitHub plugin links, plugin registry, GitHub snake workflow, Windows web installer, Linux web installer, release publishing, Discord component layouts, GitBot moderation, warnings database, welcome autorole, and GitHub role sync."
  },
  {
    href: "versions.html",
    title: "Versions",
    text: "Versions and updates explain tsundere version, tsundere updater, tsundere updater check, tsundere updater self --yes, tsundere updater self --dry-run, automatic CLI updates from GitHub releases, TSUNDERE_UPDATE_REPO, package metadata, project package updates, tsundere update discord.js, and tsundere update mysql2."
  },
  {
    href: "roadmap.html",
    title: "Roadmap",
    text: "Roadmap covers Tsundere Protect, Discord Intelligence, command visualizer, plugin marketplace, compiler work, full AST parser, TypeScript AST emission, incremental build cache, source maps, strict diagnostics, Discord interaction narrowing, command sync, Discord limits, less setup, more building, commercial-grade builds, real runtime, feature ideas, workflow pain points, docs requests, and Discord community feedback."
  },
  {
    href: "protect.html",
    title: "Tsundere Protect",
    text: "Tsundere Protect is the Node.js protection pipeline. It includes standard, advanced, and maximum profiles, tsundere build --protect, source map stripping, string encoding, runtime integrity checks, generated guard code, seeded builds, build fingerprint metadata, tsundere fingerprint inspect, and future plans for control-flow flattening, asset protection, stronger string encryption, anti-debugging, customer licensing, and leak investigation."
  },
  {
    href: "discord-intelligence.html",
    title: "Discord Intelligence",
    text: "Discord Intelligence covers intent analyzer, permission intelligence, role hierarchy analysis, invite scope analysis, compatibility checker, tsundere doctor, deprecated API detection, migration assistant, Discord version reports, hover warnings, required intents, GuildMessages, MessageContent, GuildMembers, GuildPresences, BanMembers, ModerateMembers, ManageChannels, OAuth scopes, permission dashboard, and deployment warnings."
  },
  {
    href: "visualizer.html",
    title: "Command Visualizer",
    text: "Discord Command Visualizer is a planned VS Code panel for commands, command groups, subcommands, components, modals, events, click navigation, dependency graph, command to service to database to API relationships, search, dead command detection, duplicate detection, and source navigation."
  },
  {
    href: "plugins.html",
    title: "Plugin Marketplace",
    text: "Compiler Plugin Marketplace covers TsundereLang tsundere-plugins, fork and pull request workflow, registry.json, plugin.json, tsundere plugin add, tsundere plugin install, GitHub plugin links, local plugin installs, framework plugins, database plugins, Discord plugins, compiler plugins, language plugins, parser hooks, AST hooks, type system hooks, compiler hooks, build pipeline hooks, language server hooks, CLI hooks, diagnostics, lint rules, code generation, and official registry plans."
  }
];

function setupSearch() {
  const input = document.querySelector("#docs-search-input");
  const results = document.querySelector("#docs-search-results");
  if (!input || !results) {
    return;
  }
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = "";
      results.classList.remove("open");
      return;
    }
    const terms = query.split(/\s+/u).filter(Boolean);
    const matches = docsIndex
      .map((entry) => ({ entry, score: searchScore(entry, terms) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    results.innerHTML = matches
      .map(({ entry }) => `<a href="${entry.href}"><strong>${entry.title}</strong><span>${snippet(entry.text, terms)}</span></a>`)
      .join("");
    results.classList.toggle("open", matches.length > 0);
  });
}

function searchScore(entry, terms) {
  const title = entry.title.toLowerCase();
  const text = entry.text.toLowerCase();
  return terms.reduce((score, term) => {
    if (title.includes(term)) {
      return score + 10;
    }
    if (text.includes(term)) {
      return score + 2;
    }
    return score;
  }, 0);
}

function snippet(text, terms) {
  const lower = text.toLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + 130);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
