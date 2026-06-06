# Tsundere Electron Installer

This is the polished `.exe` installer shell for Tsundere.

## Development

```powershell
npm install --prefix installer/electron
npm run installer:electron
```

## Build Windows EXE

```powershell
npm install --prefix installer/electron
npm run installer:electron:build
```

Outputs go to:

```txt
release/installer/
```

Targets:

- NSIS installer `.exe`
- Portable installer `.exe`

## Payload

Before building, create the release payload:

```powershell
npm run dist:release
```

The Electron builder packages:

- `release/tsundere-cli*.tgz`
- `release/tsundere-discord*.tgz`
- `release/vscode-tsundere*.vsix`
- `assets/tsundere-logo.png`
- `docs/local`
- PowerShell uninstaller helper

## Installer Features

- Modern custom dark UI
- Tsundere branding and logo
- Component selection
- VS Code and Cursor extension installation
- Node.js, npm, pnpm, VS Code, and Cursor detection
- Update preference storage
- Telemetry preference storage
- PATH setup
- Daily update check scheduling
- Apps & Features uninstaller registration
- Documentation, GitHub, and Discord links

