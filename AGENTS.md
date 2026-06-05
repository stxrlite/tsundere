# Tsundere AI Guide

This file is for AI coding agents working in the Tsundere repo. Read it before changing code.

## Project Overview

Tsundere is a TypeScript CLI and `.yuri` language toolchain for Discord bot projects. It keeps normal npm compatibility while adding Tsundere commands, compiler output, Discord helper runtime files, local type metadata, and a Tsundere package optimization layer.

The CLI entry point is `src/cli.ts`. The published binary is `tsundere`, and the compiled entry is `dist/cli.js`.

## Common Commands

Run these from the repo root:

```sh
npm install
npm run build
npm run test:unit
node dist/cli.js doctor
node dist/cli.js lint
node dist/cli.js commands sync
```

Use `npm run vscode:build` when changing the VS Code extension. Use `npm pack --dry-run` before packaging-related changes.

## Main Code Areas

- `src/cli.ts`: command routing, user-facing CLI output, project creation, docs, updater, runtime install, doctor checks.
- `src/compiler/`: `.yuri` project build, runtime emission, watch/dev mode, transpilation.
- `src/package-optimizer.ts`: npm install wrapper, Tsundere store/cache, hardlink/copy hydration, YAML workspace and lock generation.
- `src/platform/`: operating system isolation for Linux, macOS, and Windows paths, executable names, shell commands, permissions, and Tsundere storage paths.
- `src/type-bridge/`: Discord type extraction, metadata cache, and `.yuri` type mapping.
- `src/commands/`: Discord command discovery and manifest generation.
- `packages/discord/`: bundled `@tsundere/discord` wrapper runtime.
- `packages/vscode-tsundere/`: VS Code extension and packaged editor assets.
- `tests/`: Node test runner coverage for compiler, package optimization, and platform behavior.

## Package Management Behavior

`tsundere install` wraps `npm install`. Do not replace npm, remove `package-lock.json`, or break normal Node module resolution. The Tsundere optimizer can hydrate packages from a validated global store before npm runs and harvest packages after npm succeeds.

The default store is `~/.tsundere/store`. Tsundere also writes `tsundere-workspace.yaml` and `tsundere-lock.yaml` as YAML snapshots derived from npm metadata. These files complement npm lock behavior; they do not replace `package-lock.json`.

## Platform Rules

Keep OS-specific behavior isolated in `src/platform/`. Use platform helpers for home paths, storage paths, executable names, command lookup, file opening, and permission handling.

Linux storage paths should resolve under `~/.tsundere/`:

- `~/.tsundere/config.json`
- `~/.tsundere/cache/`
- `~/.tsundere/store/`
- `~/.tsundere/logs/`

Prefer `path.join`, `path.resolve`, `path.posix`, or `path.win32` through the platform layer instead of hardcoded separators.

## Runtime Wording

User-facing output should say `Tsundere Runtime <version>` when referring to the runtime environment. The implementation may still check the real `node` executable because Tsundere depends on Node-compatible execution and npm compatibility.

## Testing Expectations

For CLI, compiler, platform, and package management changes, run:

```sh
npm run test:unit
node dist/cli.js doctor
```

For package optimization changes, include tests for fresh installs, cached reinstalls, corrupt cache recovery, copy fallback, pruning, existing `node_modules`, and YAML lock/workspace output.

For platform changes, include tests for Linux, macOS, and Windows behavior where the logic can be simulated from Node APIs.

## Safety Rules

Do not mutate `package.json` unless a command explicitly requires it. Preserve `package-lock.json`. Never delete project files unexpectedly. Store cleanup must stay inside the configured Tsundere store. Avoid force pushes and destructive git commands unless the user explicitly asks.

Keep comments out of code unless the surrounding project already requires one for a generated file or public type declaration.
