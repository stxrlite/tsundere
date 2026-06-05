# Tsundere VS Code Extension

This package builds the official VS Code extension for `.yuri` files.

## Build

```sh
cd packages/vscode-tsundere
npm install
npm run build
```

## Discord IntelliSense

The extension contributes Discord-focused snippets and delegates deep completions, hovers, diagnostics, and narrowing to YuriLS.

Special IntelliSense is intentionally limited to `@tsundere/discord`. Other npm packages use their normal JavaScript/TypeScript types.

On project open and package lockfile changes, the extension schedules `tsundere types sync` when Discord metadata is missing or likely stale.

## Package VSIX

```sh
npm run package
```

This emits a `.vsix` file that can be installed in VS Code:

```sh
code --install-extension vscode-tsundere-0.1.0.vsix
```

## Logo

The builder copies the official mascot logo from:

```txt
../../assets/tsundere-logo.png
```

to:

```txt
packages/vscode-tsundere/assets/tsundere-logo.png
```

If the official image is missing, the builder creates a small fallback PNG so packaging still works.
