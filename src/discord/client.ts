import { EventEmitter } from "node:events";
import {
  Client as DiscordGatewayClient,
  Events,
  Partials as DiscordGatewayPartials,
  type Guild as DiscordGuild,
  type GuildMember as DiscordGuildMember,
  type Interaction as DiscordInteraction,
  type Message as DiscordMessage,
  type TextBasedChannel,
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
  readonly gateway?: DiscordGatewayClient;
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
      this.user = mapUser(readyClient.user, gateway);
      this.ping = gateway.ws.ping;
      this.emit("ready");
    });
    gateway.on(Events.InteractionCreate, (interaction) => {
      this.emit("interactionCreate", createInteraction(interaction, this));
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
    gateway.on(Events.GuildMemberRemove, (member) => {
      this.emit("guildMemberRemove", mapMember(member as DiscordGuildMember));
    });
    gateway.on(Events.MessageDelete, (message) => {
      this.emit("messageDelete", mapMessage(message as DiscordMessage));
    });
    gateway.on(Events.MessageUpdate, (oldMessage, newMessage) => {
      this.emit("messageUpdate", mapMessage(oldMessage as DiscordMessage), mapMessage(newMessage as DiscordMessage));
    });
    gateway.on(Events.ChannelCreate, (channel) => {
      this.emit("channelCreate", mapChannel(channel as NonNullable<DiscordMessage["channel"]>));
    });
    gateway.on(Events.ChannelDelete, (channel) => {
      this.emit("channelDelete", mapChannel(channel as NonNullable<DiscordMessage["channel"]>));
    });
    gateway.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
      this.emit(
        "channelUpdate",
        mapChannel(oldChannel as NonNullable<DiscordMessage["channel"]>),
        mapChannel(newChannel as NonNullable<DiscordMessage["channel"]>)
      );
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
    if (this.client.gateway) {
      const guild = await this.client.gateway.guilds.fetch(id);
      return new RuntimeGuild(this.client, id, guild);
    }
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
    if (this.client.gateway) {
      const channel = await this.client.gateway.channels.fetch(id);
      return new RuntimeChannel(this.client, id, channel && "send" in channel ? channel as TextBasedChannel : undefined);
    }
    let channel = this.channelCache.get(id);
    if (!channel) {
      channel = new RuntimeChannel(this.client, id);
      this.channelCache.set(id, channel);
    }
    return channel;
  }
}

export class RuntimeGuild implements Guild {
  readonly name: string;
  readonly members = new MemberManager(this);
  readonly channels: ChannelManager;
  readonly systemChannel: RuntimeChannel;

  constructor(readonly client: Client, readonly id: Snowflake, readonly native?: DiscordGuild) {
    this.name = native?.name ?? "Tsundere Guild";
    this.channels = client.channels;
    this.systemChannel = new RuntimeChannel(client, native?.systemChannelId ?? "system", native?.systemChannel as TextBasedChannel | undefined);
  }
}

export class RuntimeChannel implements Channel {
  readonly type = 0;
  name?: string;
  guildId?: Snowflake;

  constructor(readonly client: Client, readonly id: Snowflake, readonly native?: TextBasedChannel) {}

  async send(payload: unknown): Promise<void> {
    if (this.native && "send" in this.native && typeof this.native.send === "function") {
      await this.native.send(payload as never);
    }
  }
}

export class MemberManager {
  private readonly memberCache = new Map<string, RuntimeMember>();

  constructor(private readonly guild: RuntimeGuild) {}

  async fetch(id?: Snowflake): Promise<RuntimeMember | Map<string, RuntimeMember>> {
    if (this.guild.native) {
      if (!id) {
        const members = await this.guild.native.members.fetch();
        return new Map([...members.values()].map((member) => [member.id, new RuntimeMember(this.guild, member.id, member)]));
      }
      const member = await this.guild.native.members.fetch(id);
      return new RuntimeMember(this.guild, member.id, member);
    }
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
    if (this.guild.native) {
      await this.guild.native.members.ban(id, _options);
      return;
    }
    this.memberCache.delete(id);
  }
}

export class RuntimeMember {
  readonly user: User;
  readonly guildId: Snowflake;
  readonly roles: RuntimeMemberRoles;

  constructor(private readonly guild: RuntimeGuild, readonly id: Snowflake, readonly native?: DiscordGuildMember) {
    this.guildId = guild.id;
    this.user = native ? mapUser(native.user, guild.client.gateway) : {
      id,
      username: `User ${id}`,
      tag: `User${id}#0000`,
      bot: false
    };
    this.roles = new RuntimeMemberRoles(native);
  }

  toString(): string {
    return `<@${this.id}>`;
  }

  async kick(_reason?: string): Promise<void> {
    if (this.native) {
      await this.native.kick(_reason);
    }
    return;
  }

  async timeout(_duration: number, _reason?: string): Promise<void> {
    if (this.native) {
      await this.native.timeout(_duration, _reason);
    }
    return;
  }
}

export class RuntimeMemberRoles {
  readonly cache: Set<Snowflake>;

  constructor(private readonly native?: DiscordGuildMember) {
    this.cache = new Set(native ? [...native.roles.cache.keys()] : []);
  }

  async add(roleId: Snowflake): Promise<void> {
    if (this.native) {
      await this.native.roles.add(roleId);
    }
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

function createRuntimeUser(gateway?: DiscordGatewayClient): User {
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
    gateway?.user?.setPresence(presence as never);
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

function mapUser(user: DiscordUser, gateway?: DiscordGatewayClient): User {
  const mapped: User = {
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
  mapped.setPresence = (presence: PresenceData): void => {
    mapped.presence = {
      ...mapped.presence,
      ...presence
    };
    gateway?.user?.setPresence(presence as never);
  };
  return mapped;
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
    content: message.content,
    channel: mapChannel(message.channel),
    reply: async (response) => {
      await message.reply(typeof response === "string" ? response : normalizeInteractionResponse(response));
    }
  };
}

function mapVoiceState(state: DiscordVoiceState): import("./types.js").VoiceState {
  return {
    ...(state.guild?.id ? { guildId: state.guild.id } : {}),
    channelId: state.channelId,
    userId: state.id
  };
}

function createInteraction(interaction: DiscordInteraction, client: Client): import("./types.js").Interaction {
  const commandName = "commandName" in interaction && typeof interaction.commandName === "string" ? interaction.commandName : undefined;
  const customId = "customId" in interaction && typeof interaction.customId === "string" ? interaction.customId : undefined;
  const nativeGuild = interaction.guild ?? undefined;
  const nativeMember = interaction.member && "user" in interaction.member ? interaction.member as DiscordGuildMember : undefined;
  return {
    id: interaction.id,
    token: interaction.token,
    ...(interaction.guildId ? { guildId: interaction.guildId } : {}),
    ...(interaction.channelId ? { channelId: interaction.channelId } : {}),
    ...(interaction.user ? { user: mapUser(interaction.user, client.gateway) } : {}),
    ...(nativeMember ? { member: mapMember(nativeMember) } : {}),
    ...(nativeGuild ? { guild: new RuntimeGuild(client, nativeGuild.id, nativeGuild) } : {}),
    ...(interaction.channel ? { channel: mapChannel(interaction.channel as NonNullable<DiscordMessage["channel"]>) } : {}),
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

function readInteractionOptions(interaction: DiscordInteraction): import("./types.js").InteractionOptions {
  const options = [] as unknown as import("./types.js").InteractionOptions;
  options.user = (name: string) => readNativeOption(interaction, "getUser", name) as User | undefined;
  options.string = (name: string) => readNativeOption(interaction, "getString", name) as string | undefined;
  options.number = (name: string) => readNativeOption(interaction, "getNumber", name) as number | undefined;
  options.integer = (name: string) => readNativeOption(interaction, "getInteger", name) as number | undefined;
  options.boolean = (name: string) => readNativeOption(interaction, "getBoolean", name) as boolean | undefined;
  options.channel = (name: string) => readNativeOption(interaction, "getChannel", name) as Channel | undefined;
  options.role = (name: string) => readNativeOption(interaction, "getRole", name);
  if (!("options" in interaction) || !interaction.options || !("data" in interaction.options) || !Array.isArray(interaction.options.data)) {
    return options;
  }
  options.push(...interaction.options.data.map((option) => ({
    name: option.name,
    type: String(option.type),
    ...("value" in option && option.value !== undefined ? { value: option.value } : {}),
    ...("options" in option && Array.isArray(option.options) ? { options: option.options.map((child: { name: string; type: unknown; value?: unknown }) => ({
      name: child.name,
      type: String(child.type),
      ...("value" in child && child.value !== undefined ? { value: child.value } : {})
    })) } : {})
  })));
  return options;
}

function readNativeOption(interaction: DiscordInteraction, method: string, name: string): unknown {
  if (!("options" in interaction) || !interaction.options || !isCallable(interaction.options, method)) {
    return undefined;
  }
  const optionReader = interaction.options as unknown as Record<string, (optionName: string, required?: boolean) => unknown>;
  const value = optionReader[method]?.(name, false);
  if (method === "getUser" && value && typeof value === "object" && "id" in value && "username" in value) {
    return mapUser(value as DiscordUser);
  }
  if (method === "getChannel" && value && typeof value === "object" && "id" in value) {
    return mapChannel(value as NonNullable<DiscordMessage["channel"]>);
  }
  return value;
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
