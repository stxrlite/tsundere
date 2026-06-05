# <:tsunderecode:1512438074460602398> Tsundere Updates

> Major project updates written in Discord-friendly markdown.
> Author: **Luckyz**

## <:tsunderecode:1512438074460602398> Start to Now

**Version:** `0.1.0`

Tsundere started as a fun idea for a custom `.yuri` language and turned into a vibecoded Discord wrapper/runtime with real project tooling.

### What Tsundere Is Now

- A `.yuri` language toolchain that transpiles to JavaScript or TypeScript.
- A Discord-focused wrapper around familiar Discord.js-style ideas.
- A CLI that can create, install, build, run, start, update packages, and open docs.
- A local Node runtime so users do not have to manually run `node build/main.ts`.
- A bundled `@tsundere/discord` runtime package for generated projects.
- A VS Code/Cursor extension package with `.yuri` language support.
- A local documentation site with search, light mode, dark mode, templates, examples, and Discord event docs.

### Runtime Updates

```txt
tsundere build
```

Now emits normal build files and runnable runtime output.

```txt
tsundere start
```

Now runs the compiled app through Tsundere instead of making users call Node manually.

```txt
tsundere dev
```

Now builds, runs, watches `.yuri` files, and restarts the runtime on changes.

### Discord Runtime Updates

- Added a bundled local `@tsundere/discord` package.
- New projects point to `file:.tsundere/runtime/discord`.
- Existing projects can be fixed with:

```powershell
tsundere runtime install
tsundere install
```

This fixes the common `ERR_MODULE_NOT_FOUND` issue for `@tsundere/discord`.

### CLI Updates

- `tsundere help` now shows the installed version.
- `tsundere version` prints the current version and GitHub release repo.
- `tsundere update <package>` is for updating project packages.
- `tsundere updater` is for checking Tsundere/GitHub release info.
- Package installs prefer pnpm, but fall back to npm when pnpm is missing.

### Docs Updates

- Added local GitBook-style HTML docs.
- Added search.
- Added light mode and dark mode.
- Added lucide sun/moon theme toggle.
- Added author attribution as **Luckyz**.
- Added templates docs.
- Added examples docs.
- Added a deeper Discord events docs page.
- Moved loose examples into `docs/examples`.
- Removed unused Markdown planning docs.

### Distribution Updates

- Release builds now include:
  - `tsundere-cli.tgz`
  - `tsundere-discord.tgz`
  - `vscode-tsundere-0.1.0.vsix`
  - `install-tsundere.ps1`
  - `installer.bat`
- The installer opens documentation after install.
- The updater folder is ready for future release automation.

### Current Project Direction

Tsundere is meant to stay fun, but not useless.

The goal is:

```txt
Discord.js-style power
+ TypeScript familiarity
+ cleaner bot workflow
+ local docs and editor help
= Tsundere
```

### Planned Next Updates

- Better YuriLS language server behavior.
- More Discord IntelliSense from generated Discord package metadata.
- Cleaner slash command sync.
- Richer typed interactions and component helpers.
- A real GitHub release updater flow.
- Better packaged Windows installer.
- More docs around commands, modals, selects, embeds, and deployment.

## <:tsunderecode:1512438074460602398> Community

Join the Discord:

https://discord.gg/Gpxj5xVXBZ
