import type { Channel, Guild, Member, Message, Role, Snowflake, User } from "./types.js";

export const Permissions = {
  has(bitset: bigint, permission: bigint): boolean {
    return (bitset & permission) === permission;
  },
  add(bitset: bigint, permission: bigint): bigint {
    return bitset | permission;
  },
  remove(bitset: bigint, permission: bigint): bigint {
    return bitset & ~permission;
  }
};

export const Roles = {
  has(member: Member, roleId: Snowflake): boolean {
    return member.roles.includes(roleId);
  }
};

export const Channels = {
  mention(channel: Channel | Snowflake): string {
    return `<#${typeof channel === "string" ? channel : channel.id}>`;
  }
};

export const Guilds = {
  label(guild: Guild): string {
    return `${guild.name} (${guild.id})`;
  }
};

export const Members = {
  mention(member: Member | Snowflake): string {
    return `<@${typeof member === "string" ? member : member.id}>`;
  }
};

export const Users = {
  mention(user: User | Snowflake): string {
    return `<@${typeof user === "string" ? user : user.id}>`;
  }
};

export const Messages = {
  jumpUrl(message: Message, guildId = message.guildId): string {
    return `https://discord.com/channels/${guildId ?? "@me"}/${message.channelId}/${message.id}`;
  }
};

export const Threads = {
  archiveReason(threadId: Snowflake): string {
    return `thread:${threadId}:archive`;
  }
};

export const Invites = {
  url(code: string): string {
    return `https://discord.gg/${code}`;
  }
};

export const Webhooks = {
  url(id: Snowflake, token: string): string {
    return `https://discord.com/api/webhooks/${id}/${token}`;
  }
};

export const AuditLogs = {
  route(guildId: Snowflake): string {
    return `/guilds/${guildId}/audit-logs`;
  }
};

export const VoiceStates = {
  inChannel(member: Member, channelId: Snowflake): boolean {
    return member.guildId.length > 0 && channelId.length > 0;
  }
};
