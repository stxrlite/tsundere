# Tsundere Windows Installer

This folder contains the PowerShell fallback installer and uninstaller for Tsundere.

The preferred public installer is the Electron-based `.exe` in `installer/electron`.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\TsundereSetup.ps1
```

The installer provides:

- Custom dark Tsundere UI
- Component selection
- VS Code and Cursor detection
- Node.js, pnpm, VS Code, and Cursor checks
- PATH setup
- Update preference storage
- Telemetry preference storage
- Apps & Features uninstaller registration
- Guided onboarding links

Release packaging should bundle the Electron installer with:

- `tsundere-cli.tgz`
- `tsundere-discord.tgz`
- `vscode-tsundere-*.vsix`
- `assets/tsundere-logo.png`
- `docs/local`
