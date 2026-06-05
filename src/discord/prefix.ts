import type { Message } from "./types.js";

export interface PrefixParseResult {
  matched: boolean;
  command?: string;
  args: string[];
  raw: string;
}

export function parsePrefixCommand(message: Message, prefixes: string | string[]): PrefixParseResult {
  const choices = Array.isArray(prefixes) ? prefixes : [prefixes];
  const prefix = choices.find((value) => message.content.startsWith(value));
  if (!prefix) {
    return { matched: false, args: [], raw: message.content };
  }
  const raw = message.content.slice(prefix.length).trim();
  const [command, ...args] = raw.split(/\s+/u).filter(Boolean);
  return command ? { matched: true, command, args, raw } : { matched: false, args, raw };
}
