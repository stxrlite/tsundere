import { EventEmitter } from "node:events";
import {
  Client as DiscordGatewayClient,
  Events,
  Partials as DiscordGatewayPartials,
  type Guild as DiscordGuild,
  type GuildMember as DiscordGuildMember,
  type Interaction as DiscordInteraction,
  type Message as DiscordMessage,
  type User as DiscordUser,
  type VoiceState as DiscordVoiceState
} from "discord.js";
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
  gateway?: "discord" | "mock";
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
  private readonly gateway?: DiscordGatewayClient;
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
    if (options.gateway !== "mock") {
      this.gateway = new DiscordGatewayClient({
        intents: options.intents,
        partials: this.partials.map(mapPartial)
      });
      this.bindGatewayEvents();
    }
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
    if (!this.gateway) {
      this.ping = 1;
      queueMicrotask(() => this.emit("ready"));
      return;
    }
    await this.gateway.login(this.token);
  }

  destroy(): void {
    this.gateway?.destroy();
  }

  private bindGatewayEvents(): void {
    const gateway = this.gateway;
    if (!gateway) {
      return;
    }
    gateway.once(Events.ClientReady, (readyClient) => {
      this.user = mapUser(readyClient.user);
      this.ping = gateway.ws.ping;
      this.emit("ready");
    });
    gateway.on(Events.InteractionCreate, (interaction) => {
      this.emit("interactionCreate", createInteraction(interaction));
    });
    gateway.on(Events.MessageCreate, (message) => {
      const mapped = mapMessage(message);
      this.cache.messages.set(mapped);
      this.emit("messageCreate", mapped);
    });
    gateway.on(Events.GuildCreate, (guild) => {
      const mapped = mapGuild(guild);
      this.cache.guilds.set(mapped);
      this.emit("guildCreate", mapped);
    });
    gateway.on(Events.GuildMemberAdd, (member) => {
      const mapped = mapMember(member);
      this.cache.members.set(mapped);
      this.emit("guildMemberAdd", mapped);
    });
    gateway.on(Events.VoiceStateUpdate, (oldState, newState) => {
      this.emit("voiceStateUpdate", mapVoiceState(oldState), mapVoiceState(newState));
    });
    gateway.on(Events.Error, (error) => {
      if (this.events.listenerCount("error") > 0) {
        this.emit("error", error);
      } else {
        console.error(`Tsundere Discord gateway error: ${error.message}`);
      }
    });
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

function mapPartial(partial: Partials): DiscordGatewayPartials {
  switch (partial) {
    case "USER":
      return DiscordGatewayPartials.User;
    case "CHANNEL":
      return DiscordGatewayPartials.Channel;
    case "GUILD_MEMBER":
      return DiscordGatewayPartials.GuildMember;
    case "MESSAGE":
      return DiscordGatewayPartials.Message;
    case "REACTION":
      return DiscordGatewayPartials.Reaction;
    case "GUILD_SCHEDULED_EVENT":
      return DiscordGatewayPartials.GuildScheduledEvent;
    case "THREAD_MEMBER":
      return DiscordGatewayPartials.ThreadMember;
    default:
      return DiscordGatewayPartials.User;
  }
}

function mapUser(user: DiscordUser): User {
  return {
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    globalName: user.globalName,
    bot: user.bot,
    tag: user.tag,
    presence: {
      status: "online",
      activities: []
    }
  };
}

function mapGuild(guild: DiscordGuild): Guild {
  return {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId
  };
}

function mapChannel(channel: NonNullable<DiscordMessage["channel"]>): Channel {
  const guildId = "guildId" in channel && typeof channel.guildId === "string" ? channel.guildId : undefined;
  const name = "name" in channel && typeof channel.name === "string" ? channel.name : undefined;
  return {
    id: channel.id,
    ...(guildId !== undefined ? { guildId } : {}),
    ...(name !== undefined ? { name } : {}),
    type: Number(channel.type)
  };
}

function mapMember(member: DiscordGuildMember): import("./types.js").Member {
  return {
    id: member.id,
    user: mapUser(member.user),
    guildId: member.guild.id,
    roles: [...member.roles.cache.keys()]
  };
}

function mapMessage(message: DiscordMessage): import("./types.js").Message {
  return {
    id: message.id,
    channelId: message.channelId,
    ...(message.guildId ? { guildId: message.guildId } : {}),
    author: mapUser(message.author),
    content: message.content
  };
}

function mapVoiceState(state: DiscordVoiceState): import("./types.js").VoiceState {
  return {
    ...(state.guild?.id ? { guildId: state.guild.id } : {}),
    channelId: state.channelId,
    userId: state.id
  };
}

function createInteraction(interaction: DiscordInteraction): import("./types.js").Interaction {
  const commandName = "commandName" in interaction && typeof interaction.commandName === "string" ? interaction.commandName : undefined;
  const customId = "customId" in interaction && typeof interaction.customId === "string" ? interaction.customId : undefined;
  return {
    id: interaction.id,
    token: interaction.token,
    ...(interaction.guildId ? { guildId: interaction.guildId } : {}),
    ...(interaction.channelId ? { channelId: interaction.channelId } : {}),
    ...(interaction.user ? { user: mapUser(interaction.user) } : {}),
    ...(commandName !== undefined ? { commandName } : {}),
    ...(customId !== undefined ? { customId } : {}),
    options: readInteractionOptions(interaction),
    isCommand(name?: string): boolean {
      return isCallable(interaction, "isChatInputCommand") && interaction.isChatInputCommand() && (name === undefined || commandName === name);
    },
    isButton(id?: string): boolean {
      return isCallable(interaction, "isButton") && interaction.isButton() && (id === undefined || customId === id);
    },
    isModal(id?: string): boolean {
      return isCallable(interaction, "isModalSubmit") && interaction.isModalSubmit() && (id === undefined || customId === id);
    },
    isModalSubmit(id?: string): boolean {
      return isCallable(interaction, "isModalSubmit") && interaction.isModalSubmit() && (id === undefined || customId === id);
    },
    isSelectMenu(id?: string): boolean {
      return isSelectInteraction(interaction) && (id === undefined || customId === id);
    },
    isAutocomplete(): boolean {
      return isCallable(interaction, "isAutocomplete") && interaction.isAutocomplete();
    },
    async reply(response) {
      if (isCallable(interaction, "reply")) {
        await interaction.reply(normalizeInteractionResponse(response));
      }
    },
    async deferReply(options) {
      if (isCallable(interaction, "deferReply")) {
        await interaction.deferReply(options);
      }
    },
    async editReply(response) {
      if (isCallable(interaction, "editReply")) {
        await interaction.editReply(normalizeInteractionResponse(response));
      }
    },
    async followUp(response) {
      if (isCallable(interaction, "followUp")) {
        await interaction.followUp(normalizeInteractionResponse(response));
      }
    },
    async deleteReply() {
      if (isCallable(interaction, "deleteReply")) {
        await interaction.deleteReply();
      }
    }
  };
}

function readInteractionOptions(interaction: DiscordInteraction): import("./types.js").InteractionOption[] {
  if (!("options" in interaction) || !interaction.options || !("data" in interaction.options) || !Array.isArray(interaction.options.data)) {
    return [];
  }
  return interaction.options.data.map((option) => ({
    name: option.name,
    type: String(option.type),
    ...("value" in option && option.value !== undefined ? { value: option.value } : {}),
    ...("options" in option && Array.isArray(option.options) ? { options: option.options.map((child: { name: string; type: unknown; value?: unknown }) => ({
      name: child.name,
      type: String(child.type),
      ...("value" in child && child.value !== undefined ? { value: child.value } : {})
    })) } : {})
  }));
}

function normalizeInteractionResponse(response: import("./types.js").InteractionResponse): Record<string, unknown> {
  return {
    ...response,
    embeds: response.embeds?.map((embed) => "toJSON" in embed ? embed.toJSON() : embed),
    components: response.components?.map(normalizeRow)
  };
}

function normalizeRow(row: import("./types.js").APIComponentRow): Record<string, unknown> {
  return {
    type: 1,
    components: row.components.map(normalizeComponent)
  };
}

function normalizeComponent(component: import("./types.js").APIComponent): Record<string, unknown> {
  switch (component.type) {
    case "button":
      return {
        type: 2,
        style: buttonStyle(component.style),
        ...(component.customId ? { custom_id: component.customId } : {}),
        ...(component.label ? { label: component.label } : {}),
        ...(component.url ? { url: component.url } : {}),
        ...(component.disabled !== undefined ? { disabled: component.disabled } : {})
      };
    case "select":
      return {
        type: selectType(component.selectType),
        custom_id: component.customId,
        ...(component.placeholder ? { placeholder: component.placeholder } : {}),
        ...(component.minValues !== undefined ? { min_values: component.minValues } : {}),
        ...(component.maxValues !== undefined ? { max_values: component.maxValues } : {}),
        ...(component.options ? { options: component.options } : {})
      };
    case "textInput":
      return {
        type: 4,
        custom_id: component.customId,
        label: component.label,
        style: component.style === "paragraph" ? 2 : 1,
        ...(component.required !== undefined ? { required: component.required } : {}),
        ...(component.minLength !== undefined ? { min_length: component.minLength } : {}),
        ...(component.maxLength !== undefined ? { max_length: component.maxLength } : {}),
        ...(component.value !== undefined ? { value: component.value } : {}),
        ...(component.placeholder !== undefined ? { placeholder: component.placeholder } : {})
      };
    default:
      return { ...component };
  }
}

function buttonStyle(style: import("./types.js").APIButton["style"]): number {
  switch (style) {
    case "primary":
      return 1;
    case "secondary":
      return 2;
    case "success":
      return 3;
    case "danger":
      return 4;
    case "link":
      return 5;
  }
}

function selectType(type: import("./types.js").APISelectMenu["selectType"]): number {
  switch (type) {
    case "string":
      return 3;
    case "user":
      return 5;
    case "role":
      return 6;
    case "mentionable":
      return 7;
    case "channel":
      return 8;
  }
}

function isSelectInteraction(interaction: DiscordInteraction): boolean {
  return (
    isCallable(interaction, "isStringSelectMenu") && interaction.isStringSelectMenu() ||
    isCallable(interaction, "isUserSelectMenu") && interaction.isUserSelectMenu() ||
    isCallable(interaction, "isRoleSelectMenu") && interaction.isRoleSelectMenu() ||
    isCallable(interaction, "isMentionableSelectMenu") && interaction.isMentionableSelectMenu() ||
    isCallable(interaction, "isChannelSelectMenu") && interaction.isChannelSelectMenu()
  );
}

function isCallable<T extends string>(value: unknown, name: T): value is Record<T, (...args: never[]) => unknown> {
  return typeof value === "object" && value !== null && name in value && typeof (value as Record<T, unknown>)[name] === "function";
}
