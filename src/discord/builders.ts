import type {
  APIAttachment,
  APIButton,
  APIComponentRow,
  APIContainer,
  APIEmbed,
  APIFileComponent,
  APIMediaGallery,
  APIModal,
  APISelectMenu,
  APISection,
  APISeparator,
  APITextDisplay,
  APITextInput,
  APIThumbnailComponent,
  HexColor
} from "./types.js";

export class Embed {
  private readonly data: APIEmbed = {};

  static create(): Embed {
    return new Embed();
  }

  title(title: string): this {
    this.data.title = title;
    return this;
  }

  description(description: string): this {
    this.data.description = description;
    return this;
  }

  color(color: HexColor | number): this {
    this.data.color = typeof color === "number" ? color : Number.parseInt(color.slice(1), 16);
    return this;
  }

  field(name: string, value: string, inline = false): this {
    this.data.fields ??= [];
    this.data.fields.push({ name, value, inline });
    return this;
  }

  fields(fields: Array<{ name: string; value: string; inline?: boolean }>): this {
    this.data.fields ??= [];
    this.data.fields.push(...fields);
    return this;
  }

  footer(text: string, iconUrl?: string): this {
    this.data.footer = iconUrl ? { text, iconUrl } : { text };
    return this;
  }

  author(name: string, options: { iconUrl?: string; url?: string } = {}): this {
    this.data.author = { name, ...options };
    return this;
  }

  thumbnail(url: string): this {
    this.data.thumbnail = { url };
    return this;
  }

  image(url: string): this {
    this.data.image = { url };
    return this;
  }

  timestamp(date: Date | string = new Date()): this {
    this.data.timestamp = typeof date === "string" ? date : date.toISOString();
    return this;
  }

  url(url: string): this {
    this.data.url = url;
    return this;
  }

  validate(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if ((this.data.title?.length ?? 0) > 256) {
      errors.push("Embed title exceeds Discord's 256 character limit.");
    }
    if ((this.data.description?.length ?? 0) > 4096) {
      errors.push("Embed description exceeds Discord's 4096 character limit.");
    }
    if ((this.data.fields?.length ?? 0) > 25) {
      errors.push("Embed has more than 25 fields.");
    }
    const total = [
      this.data.title,
      this.data.description,
      this.data.footer?.text,
      this.data.author?.name,
      ...(this.data.fields ?? []).flatMap((field) => [field.name, field.value])
    ].reduce((sum, value) => sum + (value?.length ?? 0), 0);
    if (total > 6000) {
      errors.push("Embed text exceeds Discord's 6000 character total limit.");
    }
    return { ok: errors.length === 0, errors };
  }

  toJSON(): APIEmbed {
    const embed: APIEmbed = { ...this.data };
    if (this.data.fields) {
      embed.fields = [...this.data.fields];
    }
    return embed;
  }
}

export class Attachment {
  static create(name: string, data: Uint8Array | string, description?: string): APIAttachment {
    return description ? { name, data, description } : { name, data };
  }
}

export class Button {
  private readonly data: APIButton = { type: "button", style: "primary" };

  static create(customId: string): Button {
    return new Button().customId(customId);
  }

  static primary(customId: string): Button {
    return Button.create(customId).style("primary");
  }

  static secondary(customId: string): Button {
    return Button.create(customId).style("secondary");
  }

  static success(customId: string): Button {
    return Button.create(customId).style("success");
  }

  static danger(customId: string): Button {
    return Button.create(customId).style("danger");
  }

  static link(url: string): Button {
    return new Button().url(url);
  }

  customId(customId: string): this {
    this.data.customId = customId;
    return this;
  }

  label(label: string): this {
    this.data.label = label;
    return this;
  }

  style(style: APIButton["style"]): this {
    this.data.style = style;
    return this;
  }

  url(url: string): this {
    this.data.style = "link";
    this.data.url = url;
    return this;
  }

  disabled(disabled = true): this {
    this.data.disabled = disabled;
    return this;
  }

  toJSON(): APIButton {
    return { ...this.data };
  }
}

export class SelectMenu {
  private readonly data: APISelectMenu;

  private constructor(selectType: APISelectMenu["selectType"], customId: string) {
    this.data = { type: "select", selectType, customId };
  }

  static string(customId: string): SelectMenu {
    return new SelectMenu("string", customId);
  }

  static user(customId: string): SelectMenu {
    return new SelectMenu("user", customId);
  }

  static role(customId: string): SelectMenu {
    return new SelectMenu("role", customId);
  }

  static channel(customId: string): SelectMenu {
    return new SelectMenu("channel", customId);
  }

  static mentionable(customId: string): SelectMenu {
    return new SelectMenu("mentionable", customId);
  }

  placeholder(placeholder: string): this {
    this.data.placeholder = placeholder;
    return this;
  }

  values(min: number, max = min): this {
    this.data.minValues = min;
    this.data.maxValues = max;
    return this;
  }

  option(label: string, value: string, description?: string): this {
    this.data.options ??= [];
    this.data.options.push(description ? { label, value, description } : { label, value });
    return this;
  }

  toJSON(): APISelectMenu {
    const menu: APISelectMenu = { ...this.data };
    if (this.data.options) {
      menu.options = [...this.data.options];
    }
    return menu;
  }
}

export class TextInput {
  private readonly data: APITextInput;

  static short(customId: string, label: string): TextInput {
    return new TextInput(customId, label, "short");
  }

  static paragraph(customId: string, label: string): TextInput {
    return new TextInput(customId, label, "paragraph");
  }

  private constructor(customId: string, label: string, style: APITextInput["style"]) {
    this.data = { type: "textInput", customId, label, style };
  }

  required(required = true): this {
    this.data.required = required;
    return this;
  }

  length(minLength: number, maxLength?: number): this {
    this.data.minLength = minLength;
    if (maxLength !== undefined) {
      this.data.maxLength = maxLength;
    }
    return this;
  }

  placeholder(placeholder: string): this {
    this.data.placeholder = placeholder;
    return this;
  }

  value(value: string): this {
    this.data.value = value;
    return this;
  }

  toJSON(): APITextInput {
    return { ...this.data };
  }
}

export class Row {
  static of(...components: Array<{ toJSON(): APIButton | APISelectMenu | APITextInput }>): APIComponentRow {
    return { type: "row", components: components.map((component) => component.toJSON()) };
  }
}

export class TextDisplay {
  constructor(private readonly content: string) {}

  static create(content: string): TextDisplay {
    return new TextDisplay(content);
  }

  toJSON(): APITextDisplay {
    return { type: "textDisplay", content: this.content };
  }
}

export class ThumbnailComponent {
  private descriptionText?: string;

  constructor(private readonly url: string) {}

  static create(url: string): ThumbnailComponent {
    return new ThumbnailComponent(url);
  }

  description(description: string): this {
    this.descriptionText = description;
    return this;
  }

  toJSON(): APIThumbnailComponent {
    return this.descriptionText
      ? { type: "thumbnail", media: { url: this.url }, description: this.descriptionText }
      : { type: "thumbnail", media: { url: this.url } };
  }
}

export class Section {
  private readonly text: APITextDisplay[] = [];
  private accessoryComponent?: APIButton | APIThumbnailComponent;

  static create(): Section {
    return new Section();
  }

  content(content: string): this {
    this.text.push(TextDisplay.create(content).toJSON());
    return this;
  }

  accessory(component: { toJSON(): APIButton | APIThumbnailComponent }): this {
    this.accessoryComponent = component.toJSON();
    return this;
  }

  toJSON(): APISection {
    return {
      type: "section",
      components: [...this.text],
      ...(this.accessoryComponent ? { accessory: this.accessoryComponent } : {})
    };
  }
}

export class MediaGallery {
  private readonly mediaItems: APIMediaGallery["items"] = [];

  static create(): MediaGallery {
    return new MediaGallery();
  }

  item(url: string, description?: string): this {
    this.mediaItems.push(description ? { media: { url }, description } : { media: { url } });
    return this;
  }

  toJSON(): APIMediaGallery {
    return { type: "mediaGallery", items: [...this.mediaItems] };
  }
}

export class FileComponent {
  private fileName?: string;

  constructor(private readonly url: string) {}

  static create(url: string): FileComponent {
    return new FileComponent(url);
  }

  name(name: string): this {
    this.fileName = name;
    return this;
  }

  toJSON(): APIFileComponent {
    return this.fileName
      ? { type: "file", file: { url: this.url }, name: this.fileName }
      : { type: "file", file: { url: this.url } };
  }
}

export class Separator {
  private showDivider = true;
  private separatorSpacing: "small" | "large" = "small";

  static create(): Separator {
    return new Separator();
  }

  divider(divider = true): this {
    this.showDivider = divider;
    return this;
  }

  spacing(spacing: "small" | "large"): this {
    this.separatorSpacing = spacing;
    return this;
  }

  toJSON(): APISeparator {
    return { type: "separator", divider: this.showDivider, spacing: this.separatorSpacing };
  }
}

export class Container {
  private readonly childComponents: APIContainer["components"] = [];
  private color?: number;

  static create(): Container {
    return new Container();
  }

  accentColor(color: HexColor | number): this {
    this.color = typeof color === "number" ? color : Number.parseInt(color.slice(1), 16);
    return this;
  }

  add(...components: Array<{ toJSON(): APIContainer["components"][number] }>): this {
    this.childComponents.push(...components.map((component) => component.toJSON()));
    return this;
  }

  toJSON(): APIContainer {
    return {
      type: "container",
      ...(this.color !== undefined ? { accentColor: this.color } : {}),
      components: [...this.childComponents]
    };
  }
}

export const Components = {
  text: TextDisplay.create,
  section: Section.create,
  thumbnail: ThumbnailComponent.create,
  gallery: MediaGallery.create,
  file: FileComponent.create,
  separator: Separator.create,
  container: Container.create
};

export class Modal {
  private readonly rows: APIComponentRow[] = [];

  constructor(private readonly customId: string, private readonly title: string) {}

  static create(customId: string, title: string): Modal {
    return new Modal(customId, title);
  }

  row(...components: Array<{ toJSON(): APITextInput }>): this {
    this.rows.push(Row.of(...components));
    return this;
  }

  toJSON(): APIModal {
    return { type: "modal", customId: this.customId, title: this.title, components: [...this.rows] };
  }
}
