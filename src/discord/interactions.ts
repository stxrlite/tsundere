import type { Channel, Interaction, InteractionOption, Member, Role, Snowflake, User } from "./types.js";

export function parseOption<T>(interaction: Interaction, name: string): T | undefined {
  return findOption(interaction.options ?? [], name)?.value as T | undefined;
}

export function requireOption<T>(interaction: Interaction, name: string): T {
  const value = parseOption<T>(interaction, name);
  if (value === undefined || value === null) {
    throw new Error(`Missing required interaction option "${name}".`);
  }
  return value;
}

export function validateOptionType(option: InteractionOption | undefined, type: string): boolean {
  return option?.type === type;
}

export function resolveUser(interaction: Interaction, name = "user"): User | undefined {
  return parseOption<User | Snowflake>(interaction, name) as User | undefined;
}

export function resolveMember(interaction: Interaction, name = "member"): Member | undefined {
  return parseOption<Member | Snowflake>(interaction, name) as Member | undefined;
}

export function resolveRole(interaction: Interaction, name = "role"): Role | undefined {
  return parseOption<Role | Snowflake>(interaction, name) as Role | undefined;
}

export function resolveChannel(interaction: Interaction, name = "channel"): Channel | undefined {
  return parseOption<Channel | Snowflake>(interaction, name) as Channel | undefined;
}

export function customId(parts: TemplateStringsArray, ...values: Array<string | number | boolean>): string {
  return parts.reduce((acc, part, index) => `${acc}${part}${values[index] ?? ""}`, "");
}

export function parseCustomId(id: string, separator = ":"): { namespace: string; action?: string; args: string[] } {
  const [namespace = "", action, ...args] = id.split(separator);
  return action ? { namespace, action, args } : { namespace, args };
}

function findOption(options: InteractionOption[], name: string): InteractionOption | undefined {
  for (const option of options) {
    if (option.name === name) {
      return option;
    }
    const nested = option.options ? findOption(option.options, name) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}
