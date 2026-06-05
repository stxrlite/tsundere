# Tsundere Updates

> Major project updates written in Discord-friendly markdown.
> Author: **Luckyz**

## Linux, Plugins, Package Manager, and Discord Tooling

**Version:** `0.1.0`

This update moves active work onto the `linux-testing` branch and focuses on the parts that are about to matter most: Linux installs, package management, plugins, Discord tooling, moderation examples, and release publishing.

### Linux Branch

- Pulled the latest `TsundereLang/tsundere` code before applying new work.
- Moved the current changes onto `linux-testing`.
- Preserved the Linux platform helpers from the branch.
- Kept the newer Protect and fingerprint commands working with the Linux branch code.

### Package Manager Work

- Kept the new npm-first Tsundere package optimizer from the latest upstream pull.
- `tsundere install`, `tsundere add`, `tsundere remove`, and `tsundere update` stay npm-compatible.
- Added `tsundere store path`, `tsundere store prune`, and `tsundere cache clean` to the help flow.
- Verified package optimizer unit tests.

### Plugin Install Flow

`tsundere plugin install` now works as an alias for plugin installs.

Supported inputs:

```powershell
tsundere plugin install protect
tsundere plugin install @scope/my-plugin
tsundere plugin install github:user/repo
tsundere plugin install user/repo
tsundere plugin install https://github.com/user/repo.git
tsundere plugin install file:../my-plugin
```

Short names still map to official-style packages:

```txt
protect -> @tsundere/plugin-protect
```

### Plugin Registry

- Created and pushed the initial `TsundereLang/tsundere-plugins` repo.
- Added `registry.json`.
- Added contribution docs.
- Added example plugins for Protect and Discord intent diagnostics.

### GitHub Organization Workflow

- Moved the GitHub snake workflow to the correct repo: `TsundereLang/.github`.
- Removed the snake workflow from the main Tsundere language repo.

### Installers

- Added Windows and Linux web installers:

```powershell
.\install-tsundere-windows.ps1
```

```sh
sh ./install-tsundere-linux.sh
```

- Release bundles now include both web installers.
- The release builder still includes the offline installer and VS Code extension.

### Release Publishing

- Updated the GitHub release script so it asks for the version.
- It can rebuild before publishing.
- It finds the release bundle automatically.
- It generates release notes from `updates.md`.
- It updates an existing GitHub release when the tag already exists.
- It uploads the bundle with `--clobber` so releases can be refreshed without editing the script every time.

### Discord Components

- Added wrapper support for newer Discord component layouts:
  - text display
  - sections
  - thumbnails
  - media galleries
  - file components
  - separators
  - containers
- Existing button, select, modal, and row builders still work.

### Tsundere GitBot

The local `tsundere-gitbot` prototype now has:

- GitHub OAuth linking.
- Contributor role sync.
- Admin-triggered GitHub role sync.
- Bot status and activity config.
- Configurable welcome embed.
- Welcome autorole.
- Contributor thank-you messages.
- Basic moderation commands:
  - ban
  - kick
  - mute
  - warn
  - warnings
  - clearwarnings
- Warning database stored as JSON for now, with a clean service boundary for a real database later.

### Verification

- Main TypeScript build passes.
- VS Code extension build passes.
- Package optimizer unit tests pass.
- Release bundle rebuild passes.

## Community

Join the Discord:

https://discord.gg/Gpxj5xVXBZ
