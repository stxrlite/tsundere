# Tsundere Updates

> Major project updates written in Discord-friendly markdown.
> Author: **Luckyz**

## Application Update

**Version:** `0.1.1`

Tsundere moved from a basic `.yuri` experiment into a more complete Discord-focused language/runtime, installer, editor, and bot ecosystem. This update covers everything new since the first public update.

### Runtime and CLI

- `tsundere dev` now builds, runs, watches `.yuri` files, and restarts through the Tsundere runtime.
- Added a polling fallback so file watching works more reliably on Windows and OneDrive folders.
- `tsundere start` runs the compiled app through Tsundere instead of requiring `node build/main.ts`.
- Runtime ESM imports now include `.js` extensions so Node 24 can resolve generated files correctly.
- Generated runtime output refreshes the bundled `.tsundere/runtime/discord` package automatically.
- Runtime crash footers now show `Tsundere Runtime <version>` instead of only the Node.js version.
- `tsundere help` and `tsundere version` show release/version information.
- Added `tsundere updater cron [install|remove|status]` for daily update checks.
- Added security update notices when release notes include security-related keywords.
- `tsundere update <package>` remains for project package updates.
- `tsundere updater` is for Tsundere release checks and self-update flow.

### Discord Runtime

- The bundled `@tsundere/discord` runtime now uses Discord.js for real gateway login by default.
- The bot can actually appear online with a real Discord token.
- Added mock gateway mode for local/runtime tests.
- Added `client.user.setPresence(...)` support.
- Added Discord-style manager helpers:
  - `client.guilds.fetch`
  - `client.channels.fetch`
  - `guild.members.fetch`
  - `member.roles.add`
  - `member.roles.remove`
  - `member.kick`
  - `member.timeout`
  - `guild.members.ban`
  - `channel.send`
- Added better interaction option helpers:
  - `interaction.options.user`
  - `interaction.options.string`
  - `interaction.options.number`
  - `interaction.options.boolean`
  - `interaction.options.channel`
  - `interaction.options.role`
- Slash command registration no longer crashes the dev runtime when Discord REST is unavailable.
- Added support for newer Discord component layouts:
  - text display
  - sections
  - thumbnails
  - media galleries
  - file components
  - separators
  - containers

### Diagnostics and Build Output

- Compiler diagnostics are now more compact by default.
- Added colored diagnostic output.
- Added config support for disabling warnings globally.
- Added config support for disabling specific diagnostic codes.
- Warning-heavy projects can use:

```json
{
  "diagnostics": {
    "warnings": false,
    "verbose": false,
    "color": true
  }
}
```

### Package and Plugin Ecosystem

- Package installs stay compatible with npm/pnpm package names.
- The optimizer caches installed packages for faster reinstalls.
- Added store/cache commands:
  - `tsundere store path`
  - `tsundere store prune`
  - `tsundere cache clean`
- Plugin installs support short names, scoped packages, GitHub repos, git URLs, and local file paths.
- Created the starter `TsundereLang/tsundere-plugins` repository with example plugin entries.

### Windows Installer and Release Packaging

- Added an Electron-based Windows installer app.
- The installer builds a portable `.exe`.
- The installer has:
  - custom dark UI
  - draggable custom titlebar
  - minimize, maximize, and close buttons
  - Tsundere logo branding
  - package/dashboard selection
  - component selection
  - VS Code and Cursor extension options
  - Node.js, npm, pnpm, VS Code, and Cursor detection
  - update preference setup
  - telemetry connector settings
  - PATH setup
  - Apps & Features uninstaller registration
- PowerShell and Linux installers remain available as fallback installers.
- Release bundles can include:
  - Electron setup `.exe`
  - PowerShell installer
  - Linux installer
  - CLI tarball
  - Discord runtime tarball
  - VS Code/Cursor extension VSIX
  - checksums
  - release manifest

### Documentation and Website

- Local docs were moved into a GitBook-style HTML layout.
- Added search that indexes page text, not just page titles.
- Added light mode and dark mode.
- Added sidebar highlighting for dropdown pages.
- Added templates docs.
- Added examples docs.
- Added transition docs for JavaScript and Python users.
- Added Discord guide pages and event documentation.
- Added roadmap pages for Discord intelligence, visualizer ideas, Protect, plugins, and package tooling.
- Added author attribution as **Luckyz**.

### VS Code and YuriLS

- VS Code extension now uses the PNG logo/profile image instead of the old SVG branding.
- Added Discord-focused snippets.
- Improved Discord-aware IntelliSense data.
- Added language tooling work for generated Discord metadata.
- YuriLS consumes generated metadata for Discord events, builders, docs, imports, and type hints.

### Tsundere GitBot

- Created the `TsundereLang/tsundere-gitbot` project.
- GitBot is written in `.yuri`.
- Added GitHub OAuth account linking.
- Added GitHub contributor role sync.
- Added GitHub App setup URL helper.
- Added contributor stats and leaderboard support.
- Added welcome embed configuration.
- Added welcome autorole.
- Added contributor thank-you messages.
- Added moderation commands:
  - ban
  - kick
  - mute
  - warn
  - warnings
  - clearwarnings
- Added JSON warning database support.
- Added admin sync commands:
  - github-sync
  - sync-autorole
  - github-app
  - roles-panel
- Added audit logging for:
  - member joins
  - member leaves
  - channel create/delete/update
  - interactions
  - runtime errors
  - bans
  - kicks
  - timeouts
  - warnings
  - cleared warnings
  - GitHub sync
  - autorole sync
  - self-role panel posting
- Removed noisy message-send logs.
- Removed voice state update logs.
- Logging now ignores placeholder IDs like `replace-me` instead of crashing the bot.
- Added self-assign notification roles:
  - Release Notified
  - Announcement Notified
  - Bug Notified
  - Security Update Notified
- Added command registration so all bot command modules register at startup instead of only manually registered commands.

### GitHub and Release Workflow

- Added `CODEOWNERS`.
- Added release publishing script improvements.
- Release publishing can prompt for version, rebuild assets, reuse update notes, and refresh existing releases.
- Added a proper release bundle layout with checksums and manifest data.
- GitHub snake workflow was moved to the organization `.github` repo.

### Current Direction

Tsundere is still fun and vibecoded, but the project is becoming a real toolchain:

```txt
Discord.js-style power
+ TypeScript familiarity
+ .yuri project ergonomics
+ bundled runtime
+ local docs
+ editor support
+ installer app
= Tsundere
```

### Next Ideas

- Stronger YuriLS Discord IntelliSense.
- Better automatic slash command sync from discovered command files.
- More robust command routing for grouped commands.
- Signed Windows installer releases.
- Real telemetry server and crash reporting backend.
- More docs for deployment, permissions, intents, and production bots.
- More official project templates.
- Better package/plugin marketplace flow.

## Community

Join the Discord:

https://discord.gg/Gpxj5xVXBZ
