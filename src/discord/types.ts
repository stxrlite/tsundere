export type Snowflake = string;
export type HexColor = `#${string}`;

export enum Intents {
  Guilds = 1 << 0,
  GuildMembers = 1 << 1,
  GuildModeration = 1 << 2,
  GuildEmojisAndStickers = 1 << 3,
  GuildIntegrations = 1 << 4,
  GuildWebhooks = 1 << 5,
  GuildInvites = 1 << 6,
  GuildVoiceStates = 1 << 7,
  GuildPresences = 1 << 8,
  GuildMessages = 1 << 9,
  GuildMessageReactions = 1 << 10,
  GuildMessageTyping = 1 << 11,
  DirectMessages = 1 << 12,
  DirectMessageReactions = 1 << 13,
  DirectMessageTyping = 1 << 14,
  MessageContent = 1 << 15
}

export enum Partials {
  User = "USER",
  Channel = "CHANNEL",
  GuildMember = "GUILD_MEMBER",
  Message = "MESSAGE",
  Reaction = "REACTION",
  GuildScheduledEvent = "GUILD_SCHEDULED_EVENT",
  ThreadMember = "THREAD_MEMBER"
}

export interface User {
  id: Snowflake;
  username: string;
  discriminator?: string;
  globalName?: string | null;
  bot?: boolean;
  tag: string;
}

export interface Guild {
  id: Snowflake;
  name: string;
  ownerId?: Snowflake;
}

export interface Channel {
  id: Snowflake;
  guildId?: Snowflake;
  name?: string;
  type: number;
}

export interface Role {
  id: Snowflake;
  name: string;
  permissions: bigint;
}

export interface Member {
  id: Snowflake;
  user: User;
  guildId: Snowflake;
  roles: Snowflake[];
}

export interface Message {
  id: Snowflake;
  channelId: Snowflake;
  guildId?: Snowflake;
  author: User;
  content: string;
}

export interface VoiceState {
  guildId?: Snowflake;
  channelId?: Snowflake | null;
  userId: Snowflake;
}

export interface AuditLogEntry {
  id: Snowflake;
  actionType: number;
  targetId?: Snowflake | null;
  userId?: Snowflake | null;
}

export interface Invite {
  code: string;
  guild?: Guild;
  channel?: Channel;
}

export interface Webhook {
  id: Snowflake;
  token?: string;
  name?: string | null;
}

export interface DiscordEvents {
  ready: [];
  messageCreate: [message: Message];
  interactionCreate: [interaction: Interaction];
  guildCreate: [guild: Guild];
  guildMemberAdd: [member: Member];
  voiceStateUpdate: [oldState: VoiceState, newState: VoiceState];
  error: [error: Error];
}

export type EventName = keyof DiscordEvents;

export interface InteractionOption<T = unknown> {
  name: string;
  type: string;
  value?: T;
  options?: InteractionOption[];
}

export interface Interaction {
  id: Snowflake;
  token: string;
  guildId?: Snowflake;
  channelId?: Snowflake;
  user?: User;
  member?: Member;
  commandName?: string;
  customId?: string;
  options?: InteractionOption[];
  isCommand(name?: string): boolean;
  isButton(customId?: string): boolean;
  isModal(customId?: string): boolean;
  isModalSubmit(customId?: string): boolean;
  isSelectMenu(customId?: string): boolean;
  isAutocomplete(): boolean;
  reply(response: InteractionResponse): Promise<void>;
  deferReply(options?: ReplyOptions): Promise<void>;
  editReply(response: InteractionResponse): Promise<void>;
  followUp(response: InteractionResponse): Promise<void>;
  deleteReply(): Promise<void>;
}

export interface ReplyOptions {
  ephemeral?: boolean;
}

export interface InteractionResponse extends ReplyOptions {
  content?: string;
  embeds?: Array<APIEmbed | { toJSON(): APIEmbed }>;
  components?: APIComponentRow[];
  attachments?: APIAttachment[];
}

export interface APIEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string; iconUrl?: string };
  author?: { name: string; iconUrl?: string; url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  timestamp?: string;
  url?: string;
}

export interface APIAttachment {
  name: string;
  data: Uint8Array | string;
  description?: string;
}

export interface APIComponentRow {
  type: "row";
  components: APIComponent[];
}

export type APIComponent =
  | APIButton
  | APISelectMenu
  | APIModal
  | APITextInput
  | APITextDisplay
  | APISection
  | APIThumbnailComponent
  | APIMediaGallery
  | APIFileComponent
  | APISeparator
  | APIContainer;

export interface APIButton {
  type: "button";
  customId?: string;
  label?: string;
  style: "primary" | "secondary" | "success" | "danger" | "link";
  url?: string;
  disabled?: boolean;
}

export interface APISelectMenu {
  type: "select";
  selectType: "string" | "user" | "role" | "channel" | "mentionable";
  customId: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  options?: Array<{ label: string; value: string; description?: string }>;
}

export interface APIModal {
  type: "modal";
  customId: string;
  title: string;
  components: APIComponentRow[];
}

export interface APITextInput {
  type: "textInput";
  customId: string;
  label: string;
  style: "short" | "paragraph";
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  value?: string;
  placeholder?: string;
}

export interface APITextDisplay {
  type: "textDisplay";
  content: string;
}

export interface APIThumbnailComponent {
  type: "thumbnail";
  media: { url: string };
  description?: string;
}

export interface APISection {
  type: "section";
  components: APITextDisplay[];
  accessory?: APIButton | APIThumbnailComponent;
}

export interface APIMediaGallery {
  type: "mediaGallery";
  items: Array<{ media: { url: string }; description?: string }>;
}

export interface APIFileComponent {
  type: "file";
  file: { url: string };
  name?: string;
}

export interface APISeparator {
  type: "separator";
  divider?: boolean;
  spacing?: "small" | "large";
}

export interface APIContainer {
  type: "container";
  accentColor?: number;
  components: APIComponent[];
}
