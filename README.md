# Tsundere

![Tsundere logo](assets/tsundere-logo.png)

Tsundere is a fun, vibecoded, optimized Discord wrapper and `.yuri` language toolchain for building bots on Node.js.

It is for people who like Discord.js and TypeScript, but want a cleaner bot workflow with less setup pain. You still get familiar imports, async code, npm packages, and Node compatibility, but Tsundere adds its own CLI, runtime, local docs, command discovery, Discord-focused IntelliSense, and a bundled `@tsundere/discord` wrapper.

Tsundere is not trying to be a giant prebuilt bot. It does not ship economy, tickets, moderation packs, leveling, giveaways, or locked-in command systems. The point is to make the boring parts of Discord bot development smoother so you can build your own systems properly.

## Why Use It

- You want Discord.js-style power with cleaner project commands.
- You want `.yuri` files (who doesnt ;) its so cool!)
- You want `tsundere dev` to build, run, watch, and restart your bot.
- You want slash command discovery without writing a loader loop every time.
- You want a local Discord wrapper package that resolves reliably in new projects.
- You want docs, examples, templates, and editor support bundled with the tool.
- You want to prototype bots fast without giving up control over your code.

## Real Use Cases

- Utility bots with slash commands, embeds, buttons, modals, and selects.
- Community bots where you want to build your own moderation or logging logic.
- Private server bots with custom workflows and typed interactions.
- Bot dashboards or services that mix Discord code with npm packages.
- Learning projects for people who know JavaScript but want a more guided Discord setup.
- Larger bots where command discovery, runtime startup, and docs matter.

## Features

- `.yuri` files with TypeScript-style syntax
- Transpiles to JavaScript or TypeScript
- Optimized Node runtime output in `.tsundere/runtime-build`
- Bundled local `@tsundere/discord` package
- Discord client, intents, embeds, slash commands, interactions, components, REST helpers, and collectors
- Automatic command discovery for `src/commands`
- `tsundere dev` with build, run, watch, and restart
- `tsundere build` plus `tsundere start`
- npm-first package optimization with a reusable Tsundere store
- `tsundere build --protect` for protected runtime builds
- Build fingerprint metadata with `tsundere fingerprint inspect`
- Local GitBook-style docs with search, light mode, and dark mode
- VS Code and Cursor extension package
- Discord IntelliSense metadata generation
- npm and pnpm package compatibility

## Quick Start

```powershell
tsundere create my-bot --template discord
cd my-bot
tsundere install
tsundere dev
```

Production-style run:

```powershell
tsundere build
tsundere start
```

Open the local docs:

```powershell
tsundere docs
```

## Linux Setup

Tsundere supports Linux, macOS, and Windows. On Linux, install Node.js 18 or newer and npm first:

```bash
node --version
npm --version
```

From a source checkout:

```bash
npm install
npm run build
npm run linux:install
```

After installing, run:

```bash
tsundere doctor
```

Linux storage paths:

```text
~/.tsundere/
~/.tsundere/config.json
~/.tsundere/cache/
~/.tsundere/store/
~/.tsundere/logs/
```

`tsundere doctor` verifies Node.js, npm, package optimizer storage, and Linux executable permissions for bundled scripts. If Linux reports `permission denied`, run:

```bash
chmod +x scripts/install-linux.sh
chmod +x dist/cli.js
```

## Example

```yuri
import { Client, Intents, Slash, Embed } from "@tsundere/discord"

const client = new Client({
  token: env.DISCORD_TOKEN,
  intents: [Intents.Guilds, Intents.GuildMessages]
})

client.once("ready", () => {
  log(`Online as ${client.user.tag}`)
})

client.on("interactionCreate", async (interaction) => {
  if interaction.isCommand("ping") {
    await interaction.reply({
      embeds: [
        Embed.create()
          .title("Pong")
          .description(`Latency: ${client.ping}ms`)
          .color("#ff7ab6")
          .toJSON()
      ],
      ephemeral: true
    })
  }
})

Slash.command("ping")
  .description("Check bot latency")
  .register(client)

client.login()
```

## CLI

```powershell
tsundere create my-bot --template discord
tsundere install
tsundere dev
tsundere build
tsundere build --protect standard
tsundere start
tsundere docs
tsundere version
tsundere updater
tsundere update discord.js
tsundere store path
tsundere store prune
tsundere cache clean
tsundere runtime install
tsundere commands sync
tsundere types sync
tsundere fingerprint inspect
```

`tsundere updater` checks the configured GitHub release feed for newer Tsundere versions.

`tsundere update <package>` updates project packages:

```powershell
tsundere update discord.js
```

## Package Optimizer

`tsundere install` wraps normal `npm install` and keeps `package.json`, `package-lock.json`, npm scripts, and Node resolution compatible. Around npm, Tsundere adds a small optimization layer that reuses validated package directories from a global store before npm runs, then stores fresh packages after a successful install.

You can install npm packages through Tsundere:

```powershell
tsundere install discord.js
tsundere add zod
tsundere remove zod
tsundere update discord.js
```

Tsundere still lets npm own dependency resolution and `package-lock.json`. After a successful install, add, remove, or update, Tsundere also writes:

```text
tsundere-workspace.yaml
tsundere-lock.yaml
```

`tsundere-workspace.yaml` mirrors npm workspace patterns from `package.json` and defaults to the current project when no workspaces are configured. `tsundere-lock.yaml` is Tsundere's YAML snapshot of npm's lockfile, including package versions, tarball URLs, integrity strings, direct workspace importers, and portable Tsundere store keys. It is similar in spirit to pnpm's YAML workspace and lock files, but it is generated from npm metadata and does not replace `package-lock.json`.

Default store:

```powershell
tsundere store path
```

Default location:

```text
~/.tsundere/store
```

Configuration lives in `tsundere.config.json`:

```json
{
  "storePath": "~/.tsundere/store",
  "linkMode": "auto",
  "strictDependencies": false,
  "themeLogs": true
}
```

`linkMode` can be `auto`, `hardlink`, or `copy`. `auto` and `hardlink` try safe file hard links first and fall back to copying when the filesystem does not support links. Tsundere validates store metadata and package directory hashes before reuse, never deletes project files during optimization, and only prunes files inside the configured store.

Maintenance commands:

```powershell
tsundere store prune
tsundere cache clean
tsundere doctor
```

Install output includes elapsed time, cache hits and misses, reused package count, and copied versus linked packages. The logs keep the Tsundere flavor without getting in your way:

```text
Tch... dependencies installed in 1.42s.
Tsundere optimizer: 18 cache hits, 3 misses, 18 reused.
```

## Local Runtime

Tsundere projects use:

```json
{
  "dependencies": {
    "@tsundere/discord": "file:.tsundere/runtime/discord"
  }
}
```

That local package is installed by the CLI so Node can resolve `@tsundere/discord` without waiting on a public registry package.

If an existing project cannot resolve `@tsundere/discord`, run:

```powershell
tsundere runtime install
tsundere install
```

## Community

Join the Discord:

https://discord.gg/Gpxj5xVXBZ

## Docs

- Local docs: `docs/local/index.html`
- Examples: `docs/examples`
- Updates: `updates.md`
- GitHub: `https://github.com/TsundereLang/tsundere`
- Release bundle: `release`
- VS Code extension: `packages/vscode-tsundere`
- Discord runtime package: `packages/discord`

## Status

Tsundere is early, vibecoded, and moving fast. It is already useful as a local Discord wrapper/runtime experiment, and the main focus is making Discord bot development smoother without hiding the Discord API from you.

Current focus:

- Better Discord IntelliSense
- More complete `.yuri` parsing
- Stronger type metadata from Discord packages
- Cleaner command sync
- Tsundere Protect improvements for protected Node.js builds
- Discord intent and permission intelligence
- Discord command visualizer planning
- Compiler plugin marketplace design
- Real GitHub release updates
- Better installer packaging

## License

MIT
