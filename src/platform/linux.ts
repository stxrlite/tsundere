import { posix } from "node:path";

export const name = "linux" as const;

export function executable(command: string): string {
  return command;
}

export function commandLookup(command: string): { command: string; args: string[] } {
  return { command: "sh", args: ["-c", `command -v ${quoteShell(command)}`] };
}

export function openFile(path: string): { command: string; args: string[] } {
  return { command: "xdg-open", args: [path] };
}

export function tsunderePaths(home: string): { root: string; config: string; cache: string; store: string; logs: string } {
  const root = posix.join(home, ".tsundere");
  return {
    root,
    config: posix.join(root, "config.json"),
    cache: posix.join(root, "cache"),
    store: posix.join(root, "store"),
    logs: posix.join(root, "logs")
  };
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}
