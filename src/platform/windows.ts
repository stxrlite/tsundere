import { win32 } from "node:path";

export const name = "windows" as const;

export function executable(command: string): string {
  if (command === "npm" || command === "pnpm" || command === "npx") {
    return `${command}.cmd`;
  }
  return command;
}

export function commandLookup(command: string): { command: string; args: string[] } {
  return { command: "where.exe", args: [executable(command)] };
}

export function openFile(path: string): { command: string; args: string[] } {
  return { command: "cmd.exe", args: ["/c", "start", "", path] };
}

export function tsunderePaths(home: string): { root: string; config: string; cache: string; store: string; logs: string } {
  const root = win32.join(home, ".tsundere");
  return {
    root,
    config: win32.join(root, "config.json"),
    cache: win32.join(root, "cache"),
    store: win32.join(root, "store"),
    logs: win32.join(root, "logs")
  };
}
