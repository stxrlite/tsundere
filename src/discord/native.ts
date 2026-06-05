import type { Client } from "./client.js";
import type { Interaction, Snowflake } from "./types.js";
import { Button, Modal, SelectMenu, TextInput } from "./builders.js";
import { parseCustomId } from "./interactions.js";

export type SchemaShape = Record<string, unknown>;

export interface ComponentDefinition<TData extends SchemaShape> {
  kind: "component";
  namespace: string;
  create(data: TData): Button;
  parse(customId: string): TData;
}

export interface ModalDefinition<TData extends SchemaShape> {
  kind: "modal";
  namespace: string;
  schema: TData;
  create(title: string): Modal;
  parse(interaction: Interaction): TData;
}

export interface SelectDefinition<TValue extends string> {
  kind: "select";
  namespace: string;
  values: readonly TValue[];
  create(): SelectMenu;
  parse(interaction: Interaction): TValue | undefined;
}

export interface InteractionContext<TData = unknown> {
  interaction: Interaction;
  data: TData;
  reply: Interaction["reply"];
  deferReply: Interaction["deferReply"];
  editReply: Interaction["editReply"];
  followUp: Interaction["followUp"];
}

export class Component {
  static define<TData extends SchemaShape>(namespace: string): ComponentDefinition<TData> {
    return {
      kind: "component",
      namespace,
      create(data: TData) {
        return Button.primary(serializeCustomId(namespace, data));
      },
      parse(customId: string) {
        return parseSerializedCustomId<TData>(namespace, customId);
      }
    };
  }
}

export class ModalSchema {
  static define<TData extends SchemaShape>(namespace: string, schema: TData): ModalDefinition<TData> {
    return {
      kind: "modal",
      namespace,
      schema,
      create(title: string) {
        const modal = Modal.create(namespace, title);
        for (const key of Object.keys(schema)) {
          modal.row(TextInput.short(key, key));
        }
        return modal;
      },
      parse() {
        return {} as TData;
      }
    };
  }
}

export class Select {
  static define<const TValue extends string>(namespace: string, values: readonly TValue[]): SelectDefinition<TValue> {
    return {
      kind: "select",
      namespace,
      values,
      create() {
        const menu = SelectMenu.string(namespace);
        for (const value of values) {
          menu.option(value, value);
        }
        return menu;
      },
      parse(interaction: Interaction) {
        const value = interaction.options?.[0]?.value;
        return typeof value === "string" && values.includes(value as TValue) ? value as TValue : undefined;
      }
    };
  }
}

export class Schema {
  static define<TData extends SchemaShape>(shape: TData): TData {
    return shape;
  }
}

export class InteractionRouter {
  private readonly commandHandlers = new Map<string, (ctx: InteractionContext) => Promise<void> | void>();
  private readonly componentHandlers = new Map<string, (ctx: InteractionContext) => Promise<void> | void>();
  private readonly modalHandlers = new Map<string, (ctx: InteractionContext) => Promise<void> | void>();
  private readonly selectHandlers = new Map<string, (ctx: InteractionContext) => Promise<void> | void>();

  command(name: string, handler: (ctx: InteractionContext) => Promise<void> | void): this {
    this.commandHandlers.set(name, handler);
    return this;
  }

  button<TData extends SchemaShape>(definition: ComponentDefinition<TData>, handler: (ctx: InteractionContext<TData>) => Promise<void> | void): this {
    this.componentHandlers.set(definition.namespace, (ctx) => handler(ctx as InteractionContext<TData>));
    return this;
  }

  modal<TData extends SchemaShape>(definition: ModalDefinition<TData>, handler: (ctx: InteractionContext<TData>) => Promise<void> | void): this {
    this.modalHandlers.set(definition.namespace, (ctx) => handler(ctx as InteractionContext<TData>));
    return this;
  }

  select<TValue extends string>(definition: SelectDefinition<TValue>, handler: (ctx: InteractionContext<TValue>) => Promise<void> | void): this {
    this.selectHandlers.set(definition.namespace, (ctx) => handler(ctx as InteractionContext<TValue>));
    return this;
  }

  bind(client: Client): this {
    client.on("interactionCreate", async (interaction) => {
      await this.handle(interaction);
    });
    return this;
  }

  async handle(interaction: Interaction): Promise<void> {
    if (interaction.commandName && this.commandHandlers.has(interaction.commandName)) {
      await this.commandHandlers.get(interaction.commandName)?.(context(interaction));
      return;
    }
    const id = interaction.customId ? parseCustomId(interaction.customId).namespace : undefined;
    if (!id) {
      return;
    }
    if (interaction.isButton() && this.componentHandlers.has(id)) {
      await this.componentHandlers.get(id)?.(context(interaction, parseSerializedCustomId(id, interaction.customId ?? "")));
    } else if (interaction.isModalSubmit() && this.modalHandlers.has(id)) {
      await this.modalHandlers.get(id)?.(context(interaction));
    } else if (interaction.isSelectMenu() && this.selectHandlers.has(id)) {
      await this.selectHandlers.get(id)?.(context(interaction, interaction.options?.[0]?.value));
    }
  }
}

export const router = new InteractionRouter();

export const discord = {
  guild(guildId: Snowflake) {
    return {
      route: `/guilds/${guildId}`,
      member(userId: Snowflake) {
        return {
          route: `/guilds/${guildId}/members/${userId}`,
          timeout(duration: Duration) {
            return {
              route: `/guilds/${guildId}/members/${userId}`,
              method: "PATCH",
              body: { communication_disabled_until: new Date(Date.now() + duration.ms).toISOString() }
            };
          }
        };
      }
    };
  }
};

export interface Duration {
  ms: number;
}

export function hours(value: number): Duration {
  return { ms: value * 60 * 60 * 1000 };
}

function context<TData>(interaction: Interaction, data?: TData): InteractionContext<TData> {
  return {
    interaction,
    data: data as TData,
    reply: interaction.reply.bind(interaction),
    deferReply: interaction.deferReply.bind(interaction),
    editReply: interaction.editReply.bind(interaction),
    followUp: interaction.followUp.bind(interaction)
  };
}

function serializeCustomId(namespace: string, data: SchemaShape): string {
  const encoded = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  const customId = `${namespace}:${encoded}`;
  if (customId.length > 100) {
    throw new Error("Discord custom IDs must be 100 characters or fewer.");
  }
  return customId;
}

function parseSerializedCustomId<TData>(namespace: string, customId: string): TData {
  const parsed = parseCustomId(customId);
  if (parsed.namespace !== namespace || !parsed.action) {
    throw new Error(`Custom ID does not match component namespace "${namespace}".`);
  }
  return JSON.parse(Buffer.from(parsed.action, "base64url").toString("utf8")) as TData;
}
