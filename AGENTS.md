# Tsundere AI Syntax Guide

This file is for AI coding agents that need to write correct Tsundere `.yuri` code. Treat Yuri as TypeScript-style code with Discord-focused helpers and a few extra syntax forms that the Tsundere compiler lowers before emit.

## Core Language

Yuri files use `.yuri`. Write normal imports, exports, constants, objects, arrays, classes, interfaces, type aliases, async functions, promises, template strings, and method chains the same way you would in TypeScript.

```yuri
import { Client, Intents, Slash, Embed } from "@tsundere/discord"

type PingResult = {
  latency: number
}

export async function measure(client: Client): Promise<PingResult> {
  return { latency: client.ping }
}
```

The compiler can emit JavaScript or TypeScript depending on `tsundere.config.json`. Keep code valid TypeScript-style syntax unless using one of the supported Yuri conveniences below.

## Runtime Globals

Use `env` for `process.env`. The compiler inserts `const env = process.env` when it sees `env.`.

Use `log(...)` or `print(...)` for console output. The compiler binds them to `console.log` when used.

```yuri
log(`Starting ${env.BOT_NAME}`)
print("Ready")
```

## Conditionals

Normal JavaScript conditionals work.

```yuri
if (interaction.isCommand("ping")) {
  await interaction.reply("pong")
}
```

Yuri also accepts parenthesis-light `if` and `else if` when the condition is a single line before `{`.

```yuri
if interaction.isCommand("ping") {
  await interaction.reply("pong")
} else if interaction.isButton("again") {
  await interaction.reply("again")
}
```

Use braces. Do not rely on Python-style indentation.

## Functions

Normal function syntax works.

```yuri
export function formatName(name: string): string {
  return name.trim()
}
```

Yuri also supports `fn` and `async fn`; return annotations after `->` are accepted and lowered away for runtime output.

```yuri
fn label(name: string) -> string {
  return `Hello ${name}`
}

async fn loadUser(id: string) -> Promise<string> {
  return id
}
```

## Imports

Prefer the modern package import:

```yuri
import { Client, Intents, Slash, Embed } from "@tsundere/discord"
```

The compiler normalizes imports from `tsundere/discord` to `@tsundere/discord`, but new code should use `@tsundere/discord`.

## Discord Client Pattern

The standard explicit client form is preferred:

```yuri
const client = new Client({
  token: env.DISCORD_TOKEN,
  intents: [
    Intents.Guilds,
    Intents.GuildMessages
  ]
})

client.once("ready", () => {
  log(`Online as ${client.user.tag}`)
})

client.login()
```

Yuri also supports a native client block:

```yuri
client bot {
  token env.DISCORD_TOKEN
  intents [
    Guilds
    GuildMessages
  ]
}
```

That lowers to `const bot = new Client({ token, intents: [Intents.Guilds, Intents.GuildMessages] })`.

## Events

Normal event handlers work and are preferred when code is complex:

```yuri
client.on("interactionCreate", async (interaction) => {
  if interaction.isCommand("ping") {
    await interaction.reply("pong")
  }
})
```

If a `bot` variable exists from a client block, Yuri supports native event blocks:

```yuri
on ready {
  log("online")
}

on interactionCreate(interaction) {
  if interaction.isCommand("ping") {
    await interaction.reply("pong")
  }
}
```

These lower to `bot.on("event", async (...) => { ... })`.

## Slash Commands

Use `Slash.command` for commands. Chain builder methods and register with the client.

```yuri
Slash.command("ping")
  .description("Check bot latency")
  .register(client)
```

Command files in `src/commands` can export commands for discovery. Route-based command discovery is configured in `tsundere.config.json`.

```yuri
import { Slash } from "@tsundere/discord"

export default Slash.command("ping")
  .description("Check bot latency")
```

Yuri also accepts command blocks when using a `bot` variable:

```yuri
command profile {
  desc "Show your profile"
  option text user {
    desc "User name"
    required true
  }
}
```

Option type `text` maps to `string`.

## Replies

Use Discord interaction helpers such as `reply`, `deferReply`, `editReply`, and `followUp`.

```yuri
await interaction.reply({
  content: "Done",
  ephemeral: true
})
```

Yuri supports native object-call blocks for dotted calls:

```yuri
await interaction.reply {
  content "Done"
  ephemeral true
}
```

That lowers to an object argument call.

## Embeds

Use `Embed.create()` and chain methods.

```yuri
Embed.create()
  .title("Pong")
  .description(`Latency: ${client.ping}ms`)
  .color("#ff7ab6")
```

Yuri also supports an `embed` block:

```yuri
embed {
  title "Pong"
  description `Latency: ${client.ping}ms`
  color "#ff7ab6"
}
```

`desc` is accepted as an alias for `description` in Spanglish builder lowering.

## Components

Use Tsundere Discord builders for buttons, rows, selects, schemas, components, and routers.

```yuri
const pingAgain = Button.secondary("ping:again")
  .label("Ping again")

const row = Row.of(pingAgain)
```

Typed component data should use `Schema.define` and `Component.define`.

```yuri
const BanData = Schema.define({
  userId: "Snowflake"
})

const BanButton = Component.define<typeof BanData>("ban")
```

Yuri also supports simple button and row blocks:

```yuri
button pingAgain {
  style Secondary
  id "ping:again"
  label "Ping again"
}

row actions {
  use pingAgain
}
```

## Type Style

Use TypeScript-like types:

```yuri
interface Ticket {
  id: string
  ownerId: string
}

type TicketState = "open" | "closed"
```

Strict mode warns on `any`. Prefer `unknown`, concrete Discord types, or generics.

## Spanglish Aliases

The compiler supports these aliases, but prefer English TypeScript-style code for new shared examples unless a user specifically wants Spanglish.

- `usar discord { Client, Intents }` -> Discord import
- `usar pkg "zod" como z` -> default package import
- `usar pkg "dotenv/config"` -> side-effect import
- `verdad` -> `true`
- `falso` -> `false`
- `nulo` -> `null`
- `ahora()` -> `new Date()`
- `Text` -> `string`
- `Num` -> `number`
- `Bool` -> `boolean`
- `Void` -> `void`
- `tipo Name =` -> `type Name =`
- `sea` -> `let`
- `retorna` -> `return`
- `espera` -> `await`
- `lanza` -> `throw`
- `intenta` -> `try`
- `captura err` -> `catch (err)`
- `si`, `sino si`, `sino` -> `if`, `else if`, `else`
- `para item en list` -> `for (const item of list)`
- `mientras` -> `while`

## Diagnostics To Respect

Tsundere adds Discord-aware diagnostics in strict mode:

- Long custom IDs over 100 characters are errors.
- Embed titles over 256 characters are errors.
- Embed descriptions over 4096 characters are errors.
- `messageCreate`, `messageUpdate`, and `messageDelete` need `Intents.GuildMessages`.
- Reading `message.content` may need `Intents.MessageContent`.
- `guildMemberAdd` and `guildMemberRemove` need `Intents.GuildMembers`.
- `presenceUpdate` needs `Intents.GuildPresences`.
- `voiceStateUpdate` needs `Intents.GuildVoiceStates`.
- Ban, kick, timeout, channel, role, and audit log operations may trigger permission warnings.

Write code that satisfies these checks up front.

## Package And Runtime Rules For Code

Use normal npm packages through normal imports. Tsundere keeps Node-compatible resolution, so imports should look like regular TypeScript ESM imports.

For Discord helpers, import from `@tsundere/discord`. Do not import generated files from `.tsundere/runtime-build` or `.tsundere/runtime/discord` directly.

Do not edit generated output in `.tsundere/`, `.yuri-cache/`, `build/`, or `dist/` when writing source code.

## Good Starter Pattern

```yuri
import { Client, Intents, Slash, Embed } from "@tsundere/discord"

const client = new Client({
  token: env.DISCORD_TOKEN,
  intents: [Intents.Guilds]
})

client.once("ready", () => {
  log(`Online as ${client.user.tag}`)
})

client.on("interactionCreate", async (interaction) => {
  if interaction.isCommand("ping") {
    await interaction.reply({
      embeds: [
        Embed.create()
          .title("Pong")
          .description(`Latency: ${client.ping}ms`)
          .color("#ff7ab6")
      ],
      ephemeral: true
    })
  }
})

Slash.command("ping")
  .description("Check bot latency")
  .register(client)

client.login()
```
