import * as vscode from "vscode";

interface CompletionSpec {
  label: string;
  detail: string;
  docs: string;
  insertText?: string;
  kind?: vscode.CompletionItemKind;
}

const eventCompletions: CompletionSpec[] = [
  event("ready", "Client is connected and ready.", "() => {\n  $0\n}"),
  event("interactionCreate", "An interaction was created.", "(interaction) => {\n  $0\n}"),
  event("messageCreate", "A message was created.", "(message) => {\n  $0\n}"),
  event("messageDelete", "A message was deleted.", "(message) => {\n  $0\n}"),
  event("messageUpdate", "A message was updated.", "(oldMessage, newMessage) => {\n  $0\n}"),
  event("guildCreate", "The bot joined or loaded a guild.", "(guild) => {\n  $0\n}"),
  event("guildDelete", "The bot left or lost access to a guild.", "(guild) => {\n  $0\n}"),
  event("guildMemberAdd", "A member joined a guild.", "(member) => {\n  $0\n}"),
  event("guildMemberRemove", "A member left a guild.", "(member) => {\n  $0\n}"),
  event("guildBanAdd", "A member was banned.", "(ban) => {\n  $0\n}"),
  event("guildBanRemove", "A member was unbanned.", "(ban) => {\n  $0\n}"),
  event("channelCreate", "A channel was created.", "(channel) => {\n  $0\n}"),
  event("channelDelete", "A channel was deleted.", "(channel) => {\n  $0\n}"),
  event("channelUpdate", "A channel was updated.", "(oldChannel, newChannel) => {\n  $0\n}"),
  event("roleCreate", "A role was created.", "(role) => {\n  $0\n}"),
  event("roleDelete", "A role was deleted.", "(role) => {\n  $0\n}"),
  event("roleUpdate", "A role was updated.", "(oldRole, newRole) => {\n  $0\n}"),
  event("voiceStateUpdate", "A member changed voice state.", "(oldState, newState) => {\n  $0\n}"),
  event("threadCreate", "A thread was created.", "(thread) => {\n  $0\n}"),
  event("threadDelete", "A thread was deleted.", "(thread) => {\n  $0\n}"),
  event("error", "The client emitted an error.", "(error) => {\n  $0\n}"),
  event("warn", "The client emitted a warning.", "(message) => {\n  $0\n}"),
  event("debug", "The client emitted debug output.", "(message) => {\n  $0\n}"),
  event("shardReady", "A shard became ready.", "(id) => {\n  $0\n}"),
  event("shardDisconnect", "A shard disconnected.", "(event, id) => {\n  $0\n}"),
  event("shardReconnecting", "A shard is reconnecting.", "(id) => {\n  $0\n}")
];

const interactionCompletions: CompletionSpec[] = [
  method("reply", "reply(options: InteractionReplyOptions) -> Promise<Message>", "Send the initial interaction response.", "reply({\n  content: \"$1\",\n  ephemeral: true\n})"),
  method("deferReply", "deferReply(options?: ReplyOptions): Promise<void>", "Acknowledge the interaction and respond later.", "deferReply({ ephemeral: true })"),
  method("editReply", "editReply(options: InteractionReplyOptions) -> Promise<Message>", "Edit a deferred or existing interaction response.", "editReply({ content: \"$1\" })"),
  method("followUp", "followUp(options: InteractionReplyOptions) -> Promise<Message>", "Send a follow-up interaction response.", "followUp({ content: \"$1\" })"),
  method("deleteReply", "deleteReply(): Promise<void>", "Delete the original interaction reply.", "deleteReply()"),
  method("isCommand", "isCommand(name?: string): boolean", "Narrow to a command interaction.", "isCommand(\"$1\")"),
  method("isButton", "isButton(customId?: string): boolean", "Narrow to a button interaction.", "isButton(\"$1\")"),
  method("isModal", "isModal(customId?: string): boolean", "Narrow to a modal interaction.", "isModal(\"$1\")"),
  method("isModalSubmit", "isModalSubmit(customId?: string): boolean", "Narrow to a modal submit interaction.", "isModalSubmit(\"$1\")"),
  method("isSelectMenu", "isSelectMenu(customId?: string): boolean", "Narrow to a select menu interaction.", "isSelectMenu(\"$1\")"),
  method("isAutocomplete", "isAutocomplete(): boolean", "Narrow to an autocomplete interaction.", "isAutocomplete()"),
  property("user", "User | undefined", "User who invoked the interaction."),
  property("guild", "Guild | undefined", "Guild where the interaction happened."),
  property("channel", "Channel | undefined", "Channel where the interaction happened."),
  property("member", "Member | undefined", "Guild member who invoked the interaction."),
  property("commandName", "string | undefined", "Slash command name."),
  property("options", "InteractionOption[] | undefined", "Parsed interaction options."),
  property("customId", "string | undefined", "Component or modal custom ID.")
];

const slashCompletions = [
  method("description", "description(value: string): Slash", "Set slash command description.", "description(\"$1\")"),
  method("option", "option(type: CommandOptionType, name: string, description: string): Slash", "Add a typed slash command option.", "option(\"string\", \"$1\", \"$2\")"),
  method("subcommand", "subcommand(name: string, description: string, build?: Function): Slash", "Add a subcommand.", "subcommand(\"$1\", \"$2\")"),
  method("group", "group(name: string, description: string, build: Function): Slash", "Add a subcommand group.", "group(\"$1\", \"$2\", (group) => {\n  $0\n})"),
  method("permission", "permission(bitset: bigint | string): Slash", "Set required member permissions.", "permission($1)"),
  method("guildOnly", "guildOnly(): Slash", "Disable DM usage for this command.", "guildOnly()"),
  method("nsfw", "nsfw(enabled?: boolean): Slash", "Mark this command as NSFW.", "nsfw()"),
  method("autocomplete", "autocomplete(optionName: string): Slash", "Enable autocomplete for an option.", "autocomplete(\"$1\")"),
  method("register", "register(client: Client): Promise<void>", "Register the command with Discord.", "register(client)")
];

const buttonCompletions = [
  method("primary", "primary(customId: String) -> Button", "Create a primary button.", "primary(\"$1\")"),
  method("secondary", "secondary(customId: String) -> Button", "Create a secondary button.", "secondary(\"$1\")"),
  method("success", "success(customId: String) -> Button", "Create a success button.", "success(\"$1\")"),
  method("danger", "danger(customId: String) -> Button", "Create a danger button.", "danger(\"$1\")"),
  method("link", "link(url: String) -> Button", "Create a link button.", "link(\"$1\")")
];

const embedCompletions = [
  method("title", "title(value: String) -> Embed", "Set embed title.", "title(\"$1\")"),
  method("description", "description(value: String) -> Embed", "Set embed description.", "description(\"$1\")"),
  method("color", "color(value: HexColor | Number) -> Embed", "Set embed color.", "color(\"#ff7ab6\")"),
  method("field", "field(name: String, value: String, inline?: Boolean) -> Embed", "Add one embed field.", "field(\"$1\", \"$2\")"),
  method("fields", "fields(values: List<EmbedField>) -> Embed", "Add many embed fields.", "fields([$1])"),
  method("footer", "footer(text: String, iconUrl?: String) -> Embed", "Set embed footer.", "footer(\"$1\")"),
  method("author", "author(name: String, options?: EmbedAuthorOptions) -> Embed", "Set embed author.", "author(\"$1\")"),
  method("thumbnail", "thumbnail(url: String) -> Embed", "Set embed thumbnail.", "thumbnail(\"$1\")"),
  method("image", "image(url: String) -> Embed", "Set embed image.", "image(\"$1\")"),
  method("timestamp", "timestamp(date?: Date | String) -> Embed", "Set embed timestamp.", "timestamp()"),
  method("url", "url(value: String) -> Embed", "Set embed URL.", "url(\"$1\")"),
  method("validate", "validate() -> EmbedValidationResult", "Validate Discord embed limits.", "validate()")
];

const routerCompletions = [
  method("command", "command(name: String, handler: CommandHandler) -> Router", "Route a slash command interaction.", "command(\"$1\", async (ctx) => {\n  $0\n})"),
  method("button", "button(component: ComponentDefinition, handler: ButtonHandler) -> Router", "Route a typed button interaction.", "button($1, async (ctx) => {\n  $0\n})"),
  method("modal", "modal(modal: ModalDefinition, handler: ModalHandler) -> Router", "Route a typed modal submit.", "modal($1, async (ctx) => {\n  $0\n})"),
  method("select", "select(select: SelectDefinition, handler: SelectHandler) -> Router", "Route a typed select interaction.", "select($1, async (ctx) => {\n  $0\n})")
];

const componentCompletions = [
  method("define", "define<TData>(namespace: String) -> ComponentDefinition<TData>", "Define a typed component custom ID schema.", "define<{\n  ${1:id}: string\n}>(\"${2:namespace}\")"),
  method("create", "create(data: TData) -> String", "Serialize typed component data into a custom ID.", "create({ ${1:id}: ${2:value} })")
];

const modalCompletions = [
  method("define", "define(schema: ModalSchema) -> ModalDefinition", "Define a typed modal schema.", "define({\n  ${1:reason}: String\n})"),
  method("textInput", "textInput(name: String, options: TextInputOptions) -> TextInput", "Create a typed modal text input.", "textInput(\"$1\", { label: \"$2\" })")
];

const selectCompletions = [
  method("define", "define(options: SelectDefinitionOptions) -> SelectDefinition", "Define a typed select menu.", "define({\n  values: [\"${1:Option}\"]\n})"),
  method("option", "option(label: String, value: String) -> SelectOption", "Create a select option.", "option(\"$1\", \"$2\")")
];

const componentsV2Completions = [
  method("text", "text(content: String) -> TextDisplay", "Create a Discord Components v2 text display.", "text(\"$1\")"),
  method("section", "section() -> Section", "Create a section layout component.", "section()"),
  method("thumbnail", "thumbnail(url: String) -> ThumbnailComponent", "Create a section thumbnail accessory.", "thumbnail(\"$1\")"),
  method("gallery", "gallery() -> MediaGallery", "Create a media gallery component.", "gallery()"),
  method("file", "file(url: String) -> FileComponent", "Create a file display component.", "file(\"$1\")"),
  method("separator", "separator() -> Separator", "Create a separator component.", "separator()"),
  method("container", "container() -> Container", "Create a container component.", "container()")
];

const autoImports = ["Client", "Intents", "Embed", "Button", "ActionRow", "Row", "Modal", "Slash", "Permissions", "GatewayIntentBits", "Partials", "Select", "SelectMenu", "TextInput", "Component", "Components", "Container", "Section", "TextDisplay", "Router", "Schema"];

export function registerDiscordIntellisense(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [{ language: "yuri", scheme: "file" }, { language: "yuri", scheme: "untitled" }];
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, new DiscordCompletionProvider(), ".", "\""),
    vscode.languages.registerHoverProvider(selector, new DiscordHoverProvider()),
    vscode.languages.registerSignatureHelpProvider(selector, new DiscordSignatureHelpProvider(), "(", ",")
  );
}

class DiscordCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    if (!isDiscordProject(document)) {
      return autoImportItems(document);
    }

    const prefix = document.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 8), 0), position));
    if (/client\.(?:on|once)\(\s*["'][^"']*$/u.test(prefix)) {
      return eventCompletions.map(toEventItem);
    }
    if (/\binteraction\.\w*$/u.test(prefix)) {
      return interactionCompletions.map(toCompletionItem);
    }
    if (/Slash\.command\([^)]*\)\s*(?:\.[\w(["'\s,)]*)*?\.\w*$/su.test(prefix)) {
      return slashCompletions.map(toCompletionItem);
    }
    if (/\bButton\.\w*$/u.test(prefix)) {
      return buttonCompletions.map(toCompletionItem);
    }
    if (/\bComponent\.\w*$/u.test(prefix)) {
      return componentCompletions.map(toCompletionItem);
    }
    if (/\bModal\.\w*$/u.test(prefix)) {
      return modalCompletions.map(toCompletionItem);
    }
    if (/\bSelect\.\w*$/u.test(prefix)) {
      return selectCompletions.map(toCompletionItem);
    }
    if (/\bComponents\.\w*$/u.test(prefix)) {
      return componentsV2Completions.map(toCompletionItem);
    }
    if (/\brouter\.\w*$/u.test(prefix)) {
      return routerCompletions.map(toCompletionItem);
    }
    if (/Embed\.create\(\)\s*(?:\.[\w(["'#,\s)]*)*?\.\w*$/su.test(prefix)) {
      return embedCompletions.map(toCompletionItem);
    }
    return autoImportItems(document);
  }
}

class DiscordHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const word = document.getText(document.getWordRangeAtPosition(position));
    const spec = [...interactionCompletions, ...slashCompletions, ...buttonCompletions, ...embedCompletions, ...eventCompletions, ...routerCompletions, ...componentCompletions, ...modalCompletions, ...selectCompletions, ...componentsV2Completions].find((item) => item.label === word);
    if (!spec) {
      return undefined;
    }
    return new vscode.Hover(new vscode.MarkdownString(`**${spec.label}**\n\n\`${spec.detail}\`\n\n${spec.docs}`));
  }
}

class DiscordSignatureHelpProvider implements vscode.SignatureHelpProvider {
  provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position): vscode.SignatureHelp | undefined {
    const line = document.lineAt(position.line).text.slice(0, position.character);
    const match = /(\w+)\([^()]*$/u.exec(line);
    if (!match) {
      return undefined;
    }
    const spec = [...interactionCompletions, ...slashCompletions, ...buttonCompletions, ...embedCompletions, ...routerCompletions, ...componentCompletions, ...modalCompletions, ...selectCompletions, ...componentsV2Completions].find((item) => item.label === match[1]);
    if (!spec) {
      return undefined;
    }
    const help = new vscode.SignatureHelp();
    help.signatures = [new vscode.SignatureInformation(spec.detail, spec.docs)];
    help.activeSignature = 0;
    help.activeParameter = Math.max(0, line.slice(line.lastIndexOf("(") + 1).split(",").length - 1);
    return help;
  }
}

function isDiscordProject(document: vscode.TextDocument): boolean {
  return document.getText().includes("@tsundere/discord") || document.getText().includes("discord.js");
}

function autoImportItems(document: vscode.TextDocument): vscode.CompletionItem[] {
  const hasImport = document.getText().includes("@tsundere/discord");
  return autoImports.map((symbol) => {
    const item = new vscode.CompletionItem(symbol, vscode.CompletionItemKind.Class);
    item.detail = `auto import from @tsundere/discord`;
    item.documentation = `Insert ${symbol} and add an import from @tsundere/discord.`;
    if (!hasImport) {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(0, 0), `import { ${symbol} } from "@tsundere/discord"\n`);
      item.additionalTextEdits = [vscode.TextEdit.insert(new vscode.Position(0, 0), `import { ${symbol} } from "@tsundere/discord"\n`)];
    }
    return item;
  });
}

function toEventItem(spec: CompletionSpec): vscode.CompletionItem {
  const item = toCompletionItem(spec);
  item.kind = vscode.CompletionItemKind.Event;
  item.insertText = new vscode.SnippetString(`${spec.label}", ${spec.insertText ?? "() => {\n  $0\n}"}`);
  return item;
}

function toCompletionItem(spec: CompletionSpec): vscode.CompletionItem {
  const item = new vscode.CompletionItem(spec.label, spec.kind ?? vscode.CompletionItemKind.Method);
  item.detail = spec.detail;
  item.documentation = new vscode.MarkdownString(`${spec.docs}\n\n\`${spec.detail}\``);
  if (spec.insertText) {
    item.insertText = new vscode.SnippetString(spec.insertText);
  }
  return item;
}

function event(label: string, docs: string, insertText: string): CompletionSpec {
  return { label, detail: `client.on("${label}", listener)`, docs, insertText, kind: vscode.CompletionItemKind.Event };
}

function method(label: string, detail: string, docs: string, insertText: string): CompletionSpec {
  return { label, detail, docs, insertText, kind: vscode.CompletionItemKind.Method };
}

function property(label: string, detail: string, docs: string): CompletionSpec {
  return { label, detail, docs, kind: vscode.CompletionItemKind.Property };
}
