import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { CommandDiscoveryConfig, TsundereConfig } from "../types.js";
import { walk } from "../fs.js";

export interface DiscoveredCommand {
  file: string;
  name: string;
  description?: string;
  group?: string;
  route: string[];
  routeBased: boolean;
}

export interface CommandManifest {
  generatedAt: string;
  directory: string;
  commands: DiscoveredCommand[];
}

const defaultCommandConfig: Required<Pick<CommandDiscoveryConfig, "discovery" | "routeBased" | "directory">> = {
  discovery: true,
  routeBased: true,
  directory: "./src/commands"
};

export async function discoverCommands(config: TsundereConfig, cwd = process.cwd()): Promise<CommandManifest> {
  const commandConfig = { ...defaultCommandConfig, ...config.commands };
  const directory = resolve(cwd, commandConfig.directory);
  if (!commandConfig.discovery) {
    return { generatedAt: new Date().toISOString(), directory, commands: [] };
  }

  const files = await walk(directory, ".yuri");
  const commands: DiscoveredCommand[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relativePath = relative(directory, file).replace(/\\/gu, "/");
    const override = findGroupOverride(config.commands, file, cwd);
    const routeBased = override?.routeBased ?? commandConfig.routeBased;
    const routeParts = relativePath.replace(/\.yuri$/u, "").split("/");
    const metadata = readCommandMetadata(source);
    const name = (routeBased ? routeParts.at(-1) ?? metadata.name : metadata.name ?? routeParts.at(-1)) ?? "command";
    const group = routeBased && routeParts.length > 1
      ? override?.groupName ?? routeParts.slice(0, -1).join(" ")
      : undefined;
    const command: DiscoveredCommand = {
      file: relativePath,
      name,
      route: group ? [group, name] : [name],
      routeBased
    };
    if (metadata.description) {
      command.description = metadata.description;
    }
    if (group) {
      command.group = group;
    }
    commands.push(command);
  }

  return { generatedAt: new Date().toISOString(), directory, commands };
}

export async function writeCommandManifest(config: TsundereConfig, cwd = process.cwd()): Promise<CommandManifest> {
  const manifest = await discoverCommands(config, cwd);
  const file = resolve(cwd, ".yuri-cache", "discord.commands.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function readCommandMetadata(source: string): { name?: string; description?: string } {
  const objectName = readQuotedValue(source, /name\s*:\s*(["'])/u);
  const objectDescription = readQuotedValue(source, /description\s*:\s*(["'])/u);
  const builderName = readQuotedValue(source, /Slash\.command\(\s*(["'])/u);
  const builderDescription = readQuotedValue(source, /\.description\(\s*(["'])/u);
  const metadata: { name?: string; description?: string } = {};
  const name = objectName ?? builderName;
  const description = objectDescription ?? builderDescription;
  if (name) {
    metadata.name = name;
  }
  if (description) {
    metadata.description = description;
  }
  return metadata;
}

function readQuotedValue(source: string, prefix: RegExp): string | undefined {
  const match = prefix.exec(source);
  if (!match || match.index === undefined) {
    return undefined;
  }
  const quote = match[1];
  const start = match.index + match[0].length;
  const end = source.indexOf(quote ?? "\"", start);
  return end >= 0 ? source.slice(start, end) : undefined;
}

function findGroupOverride(commands: CommandDiscoveryConfig | undefined, file: string, cwd: string) {
  if (!commands?.groups) {
    return undefined;
  }
  const match = Object.entries(commands.groups).find(([folder]) => {
    const root = resolve(cwd, folder).replace(/\\/gu, "/");
    return file.replace(/\\/gu, "/").startsWith(root);
  });
  return match?.[1];
}
