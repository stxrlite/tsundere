# Tsundere Updater

Use this folder for release/update tooling. Installed Tsundere versions can update themselves from GitHub releases.

Automatic CLI update:

```powershell
tsundere updater self --yes
```

Automation-safe dry run:

```powershell
tsundere updater self --dry-run
```

The updater expects the built release files:

```txt
release/
  tsundere-cli.tgz
  tsundere-discord.tgz
  vscode-tsundere-0.1.1.vsix
  install-tsundere.ps1
  install-tsundere-windows.ps1
  install-tsundere-linux.sh
```

To rebuild release files:

```powershell
npm run dist:release
```

To update a machine with the helper script:

```powershell
.\updater\update-tsundere.ps1
```

The helper uses `tsundere updater self --yes` when the CLI is already installed. In a source checkout without an installed CLI, it falls back to the local release folder installer.

For web installs that fetch the latest GitHub release:

```powershell
.\scripts\install-tsundere-windows.ps1
```

```sh
sh ./scripts/install-tsundere-linux.sh
```

To repair a bot project that is missing `@tsundere/discord`:

```powershell
tsundere runtime install
tsundere install
```

Or:

```powershell
tsundere install @tsundere/discord
```
