# Tsundere Updater

Use this folder for release/update tooling.

The updater expects the built release files:

```txt
release/
  tsundere-cli.tgz
  tsundere-discord.tgz
  vscode-tsundere-0.1.0.vsix
  install-tsundere.ps1
```

To rebuild release files:

```powershell
npm run dist:release
```

To update a machine from the release folder:

```powershell
.\updater\update-tsundere.ps1
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
