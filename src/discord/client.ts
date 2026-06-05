import { EventEmitter } from "node:events";
import type { Channel, DiscordEvents, EventName, Guild, Partials, PresenceData, Snowflake, User } from "./types.js";
import { REST } from "./rest.js";
import { CacheManager } from "./cache.js";

export interface ClientOptions {
  token?: string;
  intents: number[];
  partials?: Partials[];
  shards?: number | "auto";
  rest?: {
    apiBase?: string;
  };
}

export class Client {
  readonly rest: REST;
  readonly cache = new CacheManager();
  readonly events = new EventEmitter();
  readonly guilds = new GuildManager(this);
  readonly channels = new ChannelManager(this);
  readonly intents: number[];
  readonly partials: Partials[];
  readonly shards: number | "auto";
  token?: string;
  user: User = createRuntimeUser();
  ping = 0;

  constructor(options: ClientOptions) {
    if (options.token !== undefined) {
      this.token = options.token;
    }
    this.intents = options.intents;
    this.partials = options.partials ?? [];
    this.shards = options.shards ?? 1;
    this.rest = new REST({
      ...(options.token !== undefined ? { token: options.token } : {}),
      ...(options.rest?.apiBase !== undefined ? { apiBase: options.rest.apiBase } : {})
    });
  }

  on<Name extends EventName>(event: Name, listener: (...args: DiscordEvents[Name]) => void): this {
    this.events.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<Name extends EventName>(event: Name, listener: (...args: DiscordEvents[Name]) => void): this {
    this.events.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<Name extends EventName>(event: Name, ...args: DiscordEvents[Name]): boolean {
    return this.events.emit(event, ...args);
  }

  async login(token = this.token): Promise<void> {
    if (!token) {
      throw new Error("Missing Discord token. Pass token to Client or login(token).");
    }
    this.token = token;
    this.rest.setToken(token);
    await this.connectGateway();
  }

  async connectGateway(): Promise<void> {
    this.ping = 1;
    queueMicrotask(() => this.emit("ready"));
  }

  async shard(id: number): Promise<ShardHandle> {
    return { id, status: "ready", latency: this.ping };
  }
}

export class GuildManager {
  private readonly guildCache = new Map<string, RuntimeGuild>();

  constructor(private readonly client: Client) {}

  async fetch(id: Snowflake): Promise<RuntimeGuild> {
    let guild = this.guildCache.get(id);
    if (!guild) {
      guild = new RuntimeGuild(this.client, id);
      this.guildCache.set(id, guild);
    }
    return guild;
  }
}

export class ChannelManager {
  private readonly channelCache = new Map<string, RuntimeChannel>();

  constructor(private readonly client: Client) {}

  async fetch(id: Snowflake): Promise<RuntimeChannel> {
    let channel = this.channelCache.get(id);
    if (!channel) {
      channel = new RuntimeChannel(this.client, id);
      this.channelCache.set(id, channel);
    }
    return channel;
  }
}

export class RuntimeGuild implements Guild {
  readonly name = "Tsundere Guild";
  readonly members = new MemberManager(this);
  readonly channels: ChannelManager;
  readonly systemChannel: RuntimeChannel;

  constructor(readonly client: Client, readonly id: Snowflake) {
    this.channels = client.channels;
    this.systemChannel = new RuntimeChannel(client, "system");
  }
}

export class RuntimeChannel implements Channel {
  readonly type = 0;
  name?: string;
  guildId?: Snowflake;

  constructor(readonly client: Client, readonly id: Snowflake) {}

  async send(payload: unknown): Promise<void> {
    void payload;
  }
}

export class MemberManager {
  private readonly memberCache = new Map<string, RuntimeMember>();

  constructor(private readonly guild: RuntimeGuild) {}

  async fetch(id?: Snowflake): Promise<RuntimeMember | Map<string, RuntimeMember>> {
    if (!id) {
      return this.memberCache;
    }
    let member = this.memberCache.get(id);
    if (!member) {
      member = new RuntimeMember(this.guild, id);
      this.memberCache.set(id, member);
    }
    return member;
  }

  async ban(user: User | Snowflake, _options?: { reason?: string }): Promise<void> {
    const id = typeof user === "string" ? user : user.id;
    this.memberCache.delete(id);
  }
}

export class RuntimeMember {
  readonly user: User;
  readonly guildId: Snowflake;
  readonly roles: RuntimeMemberRoles;

  constructor(private readonly guild: RuntimeGuild, readonly id: Snowflake) {
    this.guildId = guild.id;
    this.user = {
      id,
      username: `User ${id}`,
      tag: `User${id}#0000`,
      bot: false
    };
    this.roles = new RuntimeMemberRoles();
  }

  toString(): string {
    return `<@${this.id}>`;
  }

  async kick(_reason?: string): Promise<void> {
    return;
  }

  async timeout(_duration: number, _reason?: string): Promise<void> {
    return;
  }
}

export class RuntimeMemberRoles {
  readonly cache = new Set<Snowflake>();

  async add(roleId: Snowflake): Promise<void> {
    this.cache.add(roleId);
  }
}

export interface ShardHandle {
  id: number;
  status: "starting" | "ready" | "reconnecting" | "closed";
  latency: number;
}

export function snowflake(value: string): Snowflake {
  if (!/^\d{5,}$/u.test(value)) {
    throw new Error(`Invalid Discord snowflake: ${value}`);
  }
  return value;
}

function createRuntimeUser(): User {
  const user: User = {
    id: "0",
    username: "Tsundere",
    tag: "Tsundere#0000",
    presence: {
      status: "online",
      activities: []
    }
  };
  user.setPresence = (presence: PresenceData): void => {
    user.presence = {
      ...user.presence,
      ...presence
    };
  };
  return user;
}
