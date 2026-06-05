import type { Client } from "./client.js";
import type { Snowflake } from "./types.js";

export type CommandOptionType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "user"
  | "channel"
  | "role"
  | "mentionable";

export interface CommandOption {
  type: CommandOptionType | "subcommand" | "group";
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: boolean;
  options?: CommandOption[];
}

export interface SlashCommandData {
  name: string;
  description: string;
  options?: CommandOption[];
  defaultMemberPermissions?: string;
  dmPermission?: boolean;
  nsfw?: boolean;
}

export class Slash {
  private readonly data: SlashCommandData;

  private constructor(name: string) {
    this.data = { name, description: "No description provided." };
  }

  static command(name: string): Slash {
    return new Slash(name);
  }

  description(description: string): this {
    this.data.description = description;
    return this;
  }

  option(type: CommandOptionType, name: string, description: string, options: { required?: boolean; autocomplete?: boolean } = {}): this {
    this.data.options ??= [];
    this.data.options.push({ type, name, description, ...options });
    return this;
  }

  subcommand(name: string, description: string, build?: (command: SubcommandBuilder) => void): this {
    const subcommand = new SubcommandBuilder(name, description);
    build?.(subcommand);
    this.data.options ??= [];
    this.data.options.push(subcommand.toJSON());
    return this;
  }

  group(name: string, description: string, build: (group: CommandGroupBuilder) => void): this {
    const group = new CommandGroupBuilder(name, description);
    build(group);
    this.data.options ??= [];
    this.data.options.push(group.toJSON());
    return this;
  }

  permissions(bitset: bigint | string): this {
    this.data.defaultMemberPermissions = bitset.toString();
    return this;
  }

  permission(bitset: bigint | string): this {
    return this.permissions(bitset);
  }

  dmPermission(enabled: boolean): this {
    this.data.dmPermission = enabled;
    return this;
  }

  guildOnly(): this {
    this.data.dmPermission = false;
    return this;
  }

  nsfw(enabled = true): this {
    return this.flag("nsfw", enabled);
  }

  autocomplete(name: string): this {
    const option = this.data.options?.find((item) => item.name === name);
    if (option) {
      option.autocomplete = true;
    }
    return this;
  }

  private flag(name: string, value: boolean): this {
    (this.data as SlashCommandData & Record<string, boolean>)[name] = value;
    return this;
  }

  async register(client: Client, scope?: { guildId?: Snowflake; applicationId?: Snowflake }): Promise<void> {
    await registerSlashCommands(client, [this.toJSON()], scope);
  }

  toJSON(): SlashCommandData {
    const command: SlashCommandData = { ...this.data };
    if (this.data.options) {
      command.options = [...this.data.options];
    }
    return command;
  }
}

export class SubcommandBuilder {
  private readonly options: CommandOption[] = [];

  constructor(private readonly name: string, private readonly description: string) {}

  option(type: CommandOptionType, name: string, description: string, options: { required?: boolean; autocomplete?: boolean } = {}): this {
    this.options.push({ type, name, description, ...options });
    return this;
  }

  toJSON(): CommandOption {
    return { type: "subcommand", name: this.name, description: this.description, options: [...this.options] };
  }
}

export class CommandGroupBuilder {
  private readonly subcommands: CommandOption[] = [];

  constructor(private readonly name: string, private readonly description: string) {}

  subcommand(name: string, description: string, build?: (command: SubcommandBuilder) => void): this {
    const subcommand = new SubcommandBuilder(name, description);
    build?.(subcommand);
    this.subcommands.push(subcommand.toJSON());
    return this;
  }

  toJSON(): CommandOption {
    return { type: "group", name: this.name, description: this.description, options: [...this.subcommands] };
  }
}

export async function registerSlashCommands(
  client: Client,
  commands: SlashCommandData[],
  scope: { guildId?: Snowflake; applicationId?: Snowflake } = {}
): Promise<void> {
  const applicationId = scope.applicationId ?? client.user.id;
  const route = scope.guildId
    ? `/applications/${applicationId}/guilds/${scope.guildId}/commands`
    : `/applications/${applicationId}/commands`;
  try {
    await client.rest.put(route, commands);
  } catch (error) {
    console.warn(`Tsundere command sync skipped: ${errorSummary(error)}`);
  }
}

export async function deleteSlashCommand(
  client: Client,
  commandId: Snowflake,
  scope: { guildId?: Snowflake; applicationId?: Snowflake } = {}
): Promise<void> {
  const applicationId = scope.applicationId ?? client.user.id;
  const route = scope.guildId
    ? `/applications/${applicationId}/guilds/${scope.guildId}/commands/${commandId}`
    : `/applications/${applicationId}/commands/${commandId}`;
  await client.rest.delete(route);
}

export const syncGuildCommands = registerSlashCommands;
export const syncGlobalCommands = registerSlashCommands;

function errorSummary(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
