import * as vscode from "vscode";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { registerDiscordIntellisense } from "./discordIntellisense";

type CommandHandler = () => void | Thenable<void>;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Tsundere");
  const run = (command: string): void => {
    const terminal = vscode.window.createTerminal("Tsundere");
    terminal.show();
    terminal.sendText(command);
  };

  const commands: Record<string, CommandHandler> = {
    "tsundere.createProject": async () => {
      const name = await vscode.window.showInputBox({
        title: "Create Tsundere Project",
        prompt: "Project folder name",
        value: "tsundere-app"
      });
      if (!name) {
        return;
      }

      const template = await vscode.window.showQuickPick(
        ["discord", "rest", "websocket", "microservice", "cli", "empty"],
        { title: "Select Tsundere template" }
      );
      if (!template) {
        return;
      }

      run(`tsundere create ${quoteShell(name)} --template ${quoteShell(template)}`);
    },
    "tsundere.runDevServer": () => run("tsundere dev"),
    "tsundere.buildProject": () => run("tsundere build"),
    "tsundere.syncCommands": () => run("tsundere commands sync"),
    "tsundere.generateTypes": () => run("tsundere generate types"),
    "tsundere.openDocs": async () => {
      await vscode.env.openExternal(vscode.Uri.parse("https://tsundere.dev/docs"));
    },
    "tsundere.formatFile": () => run("tsundere format"),
    "tsundere.restartLanguageServer": () => vscode.commands.executeCommand("workbench.action.reloadWindow")
  };

  for (const [id, handler] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }

  context.subscriptions.push(output);
  registerDiscordIntellisense(context);
  registerTypeSync(context, output);
}

export function deactivate(): void {}

function quoteShell(value: string): string {
  if (/^[\w.-]+$/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/gu, '\\"')}"`;
}

function registerTypeSync(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    return;
  }

  let timer: NodeJS.Timeout | undefined;
  const schedule = (reason: string): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void syncDiscordTypesIfNeeded(workspace.uri.fsPath, output, reason);
    }, 1000);
  };

  schedule("workspace opened");
  for (const pattern of ["package.json", "pnpm-lock.yaml", "package-lock.json", "node_modules/@tsundere/discord/package.json", "node_modules/discord.js/package.json"]) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspace, pattern));
    watcher.onDidCreate(() => schedule(`${pattern} created`));
    watcher.onDidChange(() => schedule(`${pattern} changed`));
    watcher.onDidDelete(() => schedule(`${pattern} deleted`));
    context.subscriptions.push(watcher);
  }
}

async function syncDiscordTypesIfNeeded(root: string, output: vscode.OutputChannel, reason: string): Promise<void> {
  const cacheFile = resolve(root, ".yuri-cache", "discord.cache.json");
  const packageJson = resolve(root, "package.json");
  if (!existsSync(packageJson)) {
    return;
  }
  if (existsSync(cacheFile) && reason === "workspace opened") {
    return;
  }

  output.appendLine(`Running tsundere types sync (${reason})`);
  const terminal = vscode.window.createTerminal({ name: "Tsundere Types", cwd: root });
  terminal.sendText("tsundere types sync");
}
