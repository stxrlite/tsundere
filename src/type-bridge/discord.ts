import type {
  GraphDocs,
  GraphParameter,
  TypeGraph,
  YuriBuilderMetadata,
  YuriDocsMetadata,
  YuriEvent,
  YuriEventMetadata,
  YuriImportMetadata
} from "./graph.js";
import { mapCallable, mapType } from "./mapper.js";

const eventTypes: Array<[string, string[], string[]]> = [
  ["ready", [], []],
  ["interactionCreate", ["interaction: Interaction"], ["Guilds"]],
  ["messageCreate", ["message: Message"], ["GuildMessages"]],
  ["messageDelete", ["message: Message"], ["GuildMessages"]],
  ["messageUpdate", ["oldMessage: Message", "newMessage: Message"], ["GuildMessages"]],
  ["guildCreate", ["guild: Guild"], ["Guilds"]],
  ["guildDelete", ["guild: Guild"], ["Guilds"]],
  ["guildMemberAdd", ["member: Member"], ["GuildMembers"]],
  ["guildMemberRemove", ["member: Member"], ["GuildMembers"]],
  ["guildBanAdd", ["ban: GuildBan"], ["GuildModeration"]],
  ["guildBanRemove", ["ban: GuildBan"], ["GuildModeration"]],
  ["channelCreate", ["channel: Channel"], ["Guilds"]],
  ["channelDelete", ["channel: Channel"], ["Guilds"]],
  ["channelUpdate", ["oldChannel: Channel", "newChannel: Channel"], ["Guilds"]],
  ["roleCreate", ["role: Role"], ["Guilds"]],
  ["roleDelete", ["role: Role"], ["Guilds"]],
  ["roleUpdate", ["oldRole: Role", "newRole: Role"], ["Guilds"]],
  ["voiceStateUpdate", ["oldState: VoiceState", "newState: VoiceState"], ["GuildVoiceStates"]],
  ["threadCreate", ["thread: Channel"], ["Guilds"]],
  ["threadDelete", ["thread: Channel"], ["Guilds"]],
  ["error", ["error: Error"], []],
  ["warn", ["message: String"], []],
  ["debug", ["message: String"], []],
  ["shardReady", ["id: Number"], []],
  ["shardDisconnect", ["event: CloseEvent", "id: Number"], []],
  ["shardReconnecting", ["id: Number"], []]
];

const typeGuards = new Map<string, string>([
  ["isButton", "ButtonInteraction"],
  ["isChatInputCommand", "ChatInputCommandInteraction"],
  ["isCommand", "ChatInputCommandInteraction"],
  ["isAutocomplete", "AutocompleteInteraction"],
  ["isModalSubmit", "ModalSubmitInteraction"],
  ["isStringSelectMenu", "StringSelectMenuInteraction"],
  ["isUserSelectMenu", "UserSelectMenuInteraction"],
  ["isRoleSelectMenu", "RoleSelectMenuInteraction"],
  ["isChannelSelectMenu", "ChannelSelectMenuInteraction"],
  ["isMentionableSelectMenu", "MentionableSelectMenuInteraction"]
]);

const builderNames = new Set([
  "SlashCommandBuilder",
  "EmbedBuilder",
  "ButtonBuilder",
  "ActionRowBuilder",
  "ModalBuilder",
  "TextInputBuilder",
  "StringSelectMenuBuilder",
  "UserSelectMenuBuilder",
  "RoleSelectMenuBuilder",
  "ChannelSelectMenuBuilder",
  "MentionableSelectMenuBuilder",
  "Embed",
  "Button",
  "Row",
  "Modal",
  "TextInput",
  "SelectMenu",
  "Slash"
]);

const autoImports = [
  "Client",
  "Intents",
  "Embed",
  "Button",
  "ActionRow",
  "Row",
  "Modal",
  "Slash",
  "Permissions",
  "GatewayIntentBits",
  "Partials",
  "SelectMenu",
  "TextInput"
];

export function createDiscordEvents(): YuriEventMetadata {
  return {
    generatedAt: new Date().toISOString(),
    events: eventTypes.map(([name, params, requiredIntents]) => ({
      name,
      parameters: params.map(parseParameter),
      requiredIntents,
      docs: {
        description: `Discord client event "${name}".`,
        examples: [`client.on("${name}", (${params.map((param) => param.split(":")[0]).join(", ")}) => {\n  // ...\n})`]
      }
    }))
  };
}

export function createDiscordBuilders(graph: TypeGraph): YuriBuilderMetadata {
  return {
    generatedAt: new Date().toISOString(),
    builders: graph.nodes
      .filter((node) => builderNames.has(node.name))
      .map((node) => ({
        name: node.name,
        methods: (node.methods ?? []).map(mapCallable)
      }))
  };
}

export function createDiscordImports(graph: TypeGraph): YuriImportMetadata {
  const symbols: Record<string, string> = {};
  for (const node of graph.nodes) {
    if (autoImports.includes(node.name) || node.packageName === "@tsundere/discord") {
      symbols[node.name] = node.exportPath || "@tsundere/discord";
    }
  }
  for (const symbol of autoImports) {
    symbols[symbol] ??= "@tsundere/discord";
  }
  return { generatedAt: new Date().toISOString(), symbols };
}

export function createDiscordDocs(graph: TypeGraph): YuriDocsMetadata {
  const docs: YuriDocsMetadata["docs"] = {};
  for (const node of graph.nodes) {
    if (node.docs || node.deprecated) {
      docs[node.name] = { ...(node.docs ?? {}), deprecated: node.deprecated };
    }
    for (const method of node.methods ?? []) {
      docs[`${node.name}.${method.name}`] = {
        ...(method.docs ?? {}),
        signature: mapCallable(method).signature,
        deprecated: method.deprecated
      };
    }
    for (const property of node.properties ?? []) {
      docs[`${node.name}.${property.name}`] = {
        ...(property.docs ?? {}),
        signature: `${property.name}${property.optional ? "?" : ""}: ${mapType(property.type)}`,
        deprecated: property.deprecated
      };
    }
  }
  for (const [guard, narrowedType] of typeGuards) {
    docs[`Interaction.${guard}`] = {
      description: `Narrows the interaction to ${narrowedType}.`,
      signature: `${guard}() -> Boolean`
    };
  }
  return { generatedAt: new Date().toISOString(), docs };
}

export function createTypeNarrowingMetadata(): Record<string, string> {
  return Object.fromEntries(typeGuards);
}

function parseParameter(value: string): GraphParameter {
  const [name = "value", type = "Unknown"] = value.split(":").map((part) => part.trim());
  return { name, type, optional: false };
}

export function discordDiagnosticDocs(): Record<string, GraphDocs> {
  return {
    DISCORD_EVENT_INVALID: { description: "Invalid Discord event name." },
    DISCORD_EVENT_INTENT: { description: "This Discord event requires an intent that is not configured." },
    DISCORD_BUILDER_CHAIN: { description: "Invalid builder chain for the current Discord builder type." },
    DISCORD_CUSTOM_ID_LENGTH: { description: "Discord custom IDs must be 100 characters or fewer." },
    DISCORD_EMBED_LIMIT: { description: "Embed content exceeds Discord API limits." }
  };
}
