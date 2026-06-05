import type { CompileOptions, CompileResult, Diagnostic } from "../types.js";
import { positionOf } from "./diagnostics.js";

const importDiscordPattern = /from\s+["'](?:tsundere\/discord|@tsundere\/discord)["']/gu;

export function compileYuri(options: CompileOptions): CompileResult {
  const diagnostics: Diagnostic[] = [];
  let code = normalizeSyntax(options.source, options.filename, diagnostics);

  code = code.replace(importDiscordPattern, 'from "@tsundere/discord"');
  code = addRuntimePrelude(code);

  if (options.strict) {
    addStrictDiagnostics(options.source, options.filename, diagnostics);
    addDiscordDiagnostics(options.source, options.filename, diagnostics);
  }

  const extension = options.target === "typescript" ? "ts" : "js";
  const emittedFile = options.filename.replace(/\.yuri$/u, `.${extension}`);
  const mapName = `${emittedFile}.map`;
  if (options.sourceMaps) {
    code += `\n//# sourceMappingURL=${mapName.split(/[\\/]/u).at(-1) ?? mapName}`;
  }

  const result: CompileResult = {
    code,
    diagnostics
  };
  if (options.sourceMaps) {
    result.map = createSourceMap(options.filename, emittedFile, options.source);
  }
  return result;
}

function addDiscordDiagnostics(source: string, filename: string, diagnostics: Diagnostic[]): void {
  for (const match of source.matchAll(/customId\s*[:(]\s*["']([^"']+)["']/gu)) {
    const value = match[1] ?? "";
    if (value.length > 100) {
      const position = positionOf(source, match.index ?? 0);
      diagnostics.push({
        code: "DISCORD010",
        message: "Custom ID exceeds Discord's 100 character limit.",
        filename,
        line: position.line,
        column: position.column,
        severity: "error",
        hint: "Use Component.define(...) for typed compact custom IDs."
      });
    }
  }

  for (const match of source.matchAll(/\.title\(\s*["']([^"']+)["']\s*\)/gu)) {
    const value = match[1] ?? "";
    if (value.length > 256) {
      const position = positionOf(source, match.index ?? 0);
      diagnostics.push({
        code: "DISCORD005",
        message: "Embed title exceeds Discord's 256 character limit.",
        filename,
        line: position.line,
        column: position.column,
        severity: "error"
      });
    }
  }

  for (const match of source.matchAll(/\.description\(\s*["']([^"']+)["']\s*\)/gu)) {
    const value = match[1] ?? "";
    if (value.length > 4096) {
      const position = positionOf(source, match.index ?? 0);
      diagnostics.push({
        code: "DISCORD005",
        message: "Embed description exceeds Discord's 4096 character limit.",
        filename,
        line: position.line,
        column: position.column,
        severity: "error"
      });
    }
  }

  addIntentDiagnostics(source, filename, diagnostics);
  addPermissionDiagnostics(source, filename, diagnostics);
}

function addIntentDiagnostics(source: string, filename: string, diagnostics: Diagnostic[]): void {
  const rules = [
    { event: "messageCreate", required: "GuildMessages", maybe: "MessageContent", hint: "Add Intents.GuildMessages. Add Intents.MessageContent when reading message.content." },
    { event: "messageUpdate", required: "GuildMessages", hint: "Add Intents.GuildMessages for message update events." },
    { event: "messageDelete", required: "GuildMessages", hint: "Add Intents.GuildMessages for message delete events." },
    { event: "guildMemberAdd", required: "GuildMembers", hint: "Add Intents.GuildMembers and enable the privileged Server Members intent when needed." },
    { event: "guildMemberRemove", required: "GuildMembers", hint: "Add Intents.GuildMembers and enable the privileged Server Members intent when needed." },
    { event: "presenceUpdate", required: "GuildPresences", hint: "Add Intents.GuildPresences and enable the privileged Presence intent when needed." },
    { event: "voiceStateUpdate", required: "GuildVoiceStates", hint: "Add Intents.GuildVoiceStates for voice state tracking." }
  ];
  for (const rule of rules) {
    const pattern = new RegExp(`\\.on\\(\\s*["']${rule.event}["']`, "u");
    if (!pattern.test(source)) {
      continue;
    }
    const position = positionOf(source, source.search(new RegExp(rule.event, "u")));
    if (!new RegExp(`\\b${rule.required}\\b`, "u").test(source)) {
      diagnostics.push({
        code: "DISCORD002",
        message: `${rule.event} requires the ${rule.required} intent.`,
        filename,
        line: position.line,
        column: position.column,
        severity: "warning",
        hint: rule.hint
      });
    }
    if (rule.maybe && /\bmessage\.content\b|\bmsg\.content\b/u.test(source) && !new RegExp(`\\b${rule.maybe}\\b`, "u").test(source)) {
      diagnostics.push({
        code: "DISCORD003",
        message: `${rule.event} code reads message content and may require the ${rule.maybe} intent.`,
        filename,
        line: position.line,
        column: position.column,
        severity: "warning",
        hint: rule.hint
      });
    }
  }
}

function addPermissionDiagnostics(source: string, filename: string, diagnostics: Diagnostic[]): void {
  const rules = [
    { pattern: /\.ban\(/u, permission: "BanMembers", message: "Ban operations may require the BanMembers permission.", hint: "Check bot role hierarchy and BanMembers permission." },
    { pattern: /\.timeout\(/u, permission: "ModerateMembers", message: "Timeout operations may require the ModerateMembers permission.", hint: "Check bot role hierarchy and ModerateMembers permission." },
    { pattern: /\.kick\(/u, permission: "KickMembers", message: "Kick operations may require the KickMembers permission.", hint: "Check bot role hierarchy and KickMembers permission." },
    { pattern: /\.channels\.create\(|\.createChannel\(/u, permission: "ManageChannels", message: "Channel creation may require the ManageChannels permission.", hint: "Add ManageChannels to the bot invite when creating channels." },
    { pattern: /\.roles\.create\(|\.setRole|\baddRole\(/u, permission: "ManageRoles", message: "Role operations may require the ManageRoles permission.", hint: "Check role hierarchy and ManageRoles permission." },
    { pattern: /\.fetchAuditLogs\(/u, permission: "ViewAuditLog", message: "Audit log reads may require the ViewAuditLog permission.", hint: "Add ViewAuditLog when reading guild audit logs." }
  ];
  for (const rule of rules) {
    const index = source.search(rule.pattern);
    if (index < 0) {
      continue;
    }
    const position = positionOf(source, index);
    diagnostics.push({
      code: "DISCORD020",
      message: rule.message,
      filename,
      line: position.line,
      column: position.column,
      severity: "warning",
      hint: `${rule.hint} Required permission: ${rule.permission}.`
    });
  }
}

function addRuntimePrelude(code: string): string {
  const prelude: string[] = [];
  if (/\benv\./u.test(code)) {
    prelude.push("const env = process.env");
  }
  if (/\blog\(/u.test(code)) {
    prelude.push("const log = console.log.bind(console)");
  }
  if (/\bprint\(/u.test(code)) {
    prelude.push("const print = console.log.bind(console)");
  }
  return prelude.length > 0 ? `${prelude.join("\n")}\n${code}` : code;
}

function normalizeSyntax(source: string, filename: string, diagnostics: Diagnostic[]): string {
  let output = source;
  output = lowerSpanglishImports(output);
  output = lowerSpanglishLiterals(output);
  output = lowerSpanglishTypes(output);
  output = lowerSpanglishBot(output);
  output = lowerSpanglishEvents(output);
  output = lowerSpanglishDiscordBlocks(output);
  output = lowerSpanglishKeywords(output);
  output = lowerNativeClientBlocks(output);
  output = lowerNativeEvents(output);
  output = lowerNativeEmbeds(output);
  output = lowerNativeObjectCalls(output);
  output = lowerNativeFunctions(output);
  output = output.replace(/\bif\s+([^{()\n][^{\n]*?)\s*\{/gu, "if ($1) {");
  output = output.replace(/\belse\s+if\s+([^{()\n][^{\n]*?)\s*\{/gu, "else if ($1) {");
  output = output.replace(/\bmatch\s*\((.*?)\)\s*\{/gsu, (_match, expression: string) => {
    diagnostics.push({
      code: "YURI210",
      message: "Pattern matching is recognized but currently emitted as a runtime match expression.",
      filename,
      line: 1,
      column: 1,
      severity: "warning",
      hint: `Use match(${expression.trim()}).case(...).default(...) until full match lowering lands.`
    });
    return `match(${expression})({`;
  });
  return output;
}

function lowerSpanglishImports(source: string): string {
  return source
    .replace(/^(\s*)usar\s+discord\s*\{([^}]+)\}/gmu, (_match, indent: string, names: string) => {
      return `${indent}import { ${names.trim()} } from "@tsundere/discord"`;
    })
    .replace(/^(\s*)usar\s+env\s*$/gmu, "$1")
    .replace(/^(\s*)usar\s+pkg\s+["']([^"']+)["']\s+como\s+([A-Za-z_$][\w$]*)/gmu, "$1import $3 from \"$2\"")
    .replace(/^(\s*)usar\s+pkg\s+["']([^"']+)["']/gmu, "$1import \"$2\"");
}

function lowerSpanglishLiterals(source: string): string {
  return source
    .replace(/\bverdad\b/gu, "true")
    .replace(/\bfalso\b/gu, "false")
    .replace(/\bnulo\b/gu, "null")
    .replace(/\bahora\(\)/gu, "new Date()");
}

function lowerSpanglishTypes(source: string): string {
  return source
    .replace(/\bText\b/gu, "string")
    .replace(/\bNum\b/gu, "number")
    .replace(/\bBool\b/gu, "boolean")
    .replace(/\bVoid\b/gu, "void")
    .replace(/\btipo\s+([A-Za-z_$][\w$]*)\s*=/gu, "type $1 =");
}

function lowerSpanglishKeywords(source: string): string {
  return source
    .replace(/\bsea\s+/gu, "let ")
    .replace(/\bretorna\b/gu, "return")
    .replace(/\bespera\b/gu, "await")
    .replace(/\blanza\b/gu, "throw")
    .replace(/\bintenta\s*\{/gu, "try {")
    .replace(/\bcaptura\s+([A-Za-z_$][\w$]*)\s*\{/gu, "catch ($1) {")
    .replace(/\bsi\s+([^{()\n][^{\n]*?)\s*\{/gu, "if ($1) {")
    .replace(/\bsino\s+si\s+([^{()\n][^{\n]*?)\s*\{/gu, "else if ($1) {")
    .replace(/\bsino\s*\{/gu, "else {")
    .replace(/\bpara\s+([A-Za-z_$][\w$]*)\s+en\s+([^{\n]+?)\s*\{/gu, "for (const $1 of $2) {")
    .replace(/\bmientras\s+([^{()\n][^{\n]*?)\s*\{/gu, "while ($1) {");
}

function lowerSpanglishBot(source: string): string {
  return replaceNamedBlocks(source, /\bbot\s+([A-Za-z_$][\w$]*)\s*\{/gu, (name, body) => {
    const token = /(?:^|\n)\s*token\s+([^\n]+)/u.exec(body)?.[1]?.trim() ?? "env.DISCORD_TOKEN";
    const intentsBody = /(?:^|\n)\s*intents\s*\[([\s\S]*?)\]/u.exec(body)?.[1] ?? "";
    const intents = intentsBody
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((intent) => `Intents.${intent}`)
      .join(", ");
    const status = /(?:^|\n)\s*status\s+([^\n]+)/u.exec(body)?.[1]?.trim();
    const activity = /(?:^|\n)\s*activity\s+([^\n]+)/u.exec(body)?.[1]?.trim();
    const extras = [
      status ? `\nbot.status = ${status}` : "",
      activity ? `\nbot.activity = ${activity}` : ""
    ].join("");
    return `const bot = new Client({\n  token: ${token},\n  intents: [${intents}]\n})${extras}`;
  });
}

function lowerSpanglishEvents(source: string): string {
  return replaceBlocks(source, /^(\s*)event\s+([A-Za-z_$][\w$]*)(?:\(([^)]*)\))?\s*\{/gmu, (match, body) => {
    const indent = match[1] ?? "";
    const event = match[2] ?? "";
    const params = match[3] ?? "";
    return `${indent}bot.on("${event}", async (${params}) => {${body}\n${indent}})`;
  });
}

function lowerSpanglishDiscordBlocks(source: string): string {
  let output = source;
  output = replaceKeywordBlocks(output, "embed", (body) => lowerBuilderBlock("Embed.create()", body, { desc: "description" }));
  output = replaceNamedBlocks(output, /\bbutton\s+([A-Za-z_$][\w$]*)\s*\{/gu, (name, body) => {
    const style = /(?:^|\n)\s*style\s+([A-Za-z_$][\w$]*)/u.exec(body)?.[1] ?? "Primary";
    const customId = /(?:^|\n)\s*id\s+([^\n]+)/u.exec(body)?.[1]?.trim() ?? `"${name}"`;
    const label = /(?:^|\n)\s*label\s+([^\n]+)/u.exec(body)?.[1]?.trim();
    return `const ${name} = Button.${style.toLowerCase()}(${customId})${label ? `\n  .label(${label})` : ""}`;
  });
  output = replaceNamedBlocks(output, /\brow\s+([A-Za-z_$][\w$]*)\s*\{/gu, (name, body) => {
    const items = body
      .split(/\r?\n/u)
      .map((line) => /^\s*(?:use|button)\s+([A-Za-z_$][\w$]*)/u.exec(line)?.[1])
      .filter((value): value is string => Boolean(value));
    return `const ${name} = Row.of(${items.join(", ")})`;
  });
  output = lowerSpanglishCommands(output);
  return output;
}

function lowerSpanglishCommands(source: string): string {
  return replaceNamedBlocks(source, /\bcommand\s+([A-Za-z_$][\w$]*)\s*\{/gu, (name, body) => {
    const desc = /(?:^|\n)\s*desc\s+([^\n]+)/u.exec(body)?.[1]?.trim() ?? `"${name} command"`;
    const options = [...body.matchAll(/(?:^|\n)\s*option\s+([A-Za-z_$][\w$]*)\s+([A-Za-z_$][\w$]*)\s*\{([\s\S]*?)\n\s*\}/gu)]
      .map((match) => {
        const type = match[1] ?? "string";
        const optionName = match[2] ?? "option";
        const optionBody = match[3] ?? "";
        const optionDesc = /(?:^|\n)\s*desc\s+([^\n]+)/u.exec(optionBody)?.[1]?.trim() ?? `"${optionName}"`;
        const required = /(?:^|\n)\s*required\s+(true|false)/u.exec(optionBody)?.[1] === "true";
        const mappedType = type === "text" ? "string" : type;
        return `\n  .option("${mappedType}", "${optionName}", ${optionDesc}, { required: ${required} })`;
      })
      .join("");
    return `const ${name}Command = Slash.command("${name}")\n  .description(${desc})${options}\n${name}Command.register(bot)`;
  });
}

function lowerBuilderBlock(root: string, body: string, aliases: Record<string, string> = {}): string {
  const calls = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([A-Za-z_$][\w$]*):?\s+(.+)$/u.exec(line);
      if (!match) {
        return "";
      }
      const name = aliases[match[1] ?? ""] ?? match[1] ?? "";
      const value = match[2] ?? "";
      return `.${name}(${value.trim()})`;
    })
    .join("\n  ");
  return `${root}\n  ${calls}`;
}

function lowerNativeFunctions(source: string): string {
  return source
    .replace(/\basync\s+fn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*->\s*[A-Za-z_$][\w$<>|&\s?.]*\s*\{/gu, "async function $1($2) {")
    .replace(/\bfn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*->\s*[A-Za-z_$][\w$<>|&\s?.]*\s*\{/gu, "function $1($2) {")
    .replace(/\basync\s+fn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gu, "async function $1($2) {")
    .replace(/\bfn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gu, "function $1($2) {");
}

function lowerNativeEvents(source: string): string {
  return replaceBlocks(source, /^(\s*)on\s+([A-Za-z_$][\w$]*)(?:\(([^)]*)\))?\s*\{/gmu, (match, body) => {
    const indent = match[1] ?? "";
    const event = match[2] ?? "";
    const params = match[3] ?? "";
    return `${indent}bot.on("${event}", async (${params}) => {${body}\n${indent}})`;
  });
}

function lowerNativeClientBlocks(source: string): string {
  return replaceNamedBlocks(source, /\bclient\s+([A-Za-z_$][\w$]*)\s*\{/gu, (name, body) => {
    const token = /(?:^|\n)\s*token\s+([^\n]+)/u.exec(body)?.[1]?.trim() ?? "env.DISCORD_TOKEN";
    const intentsBody = /(?:^|\n)\s*intents\s*\[([\s\S]*?)\]/u.exec(body)?.[1] ?? "";
    const intents = intentsBody
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((intent) => `Intents.${intent}`)
      .join(", ");
    return `const ${name} = new Client({\n  token: ${token},\n  intents: [${intents}]\n})`;
  });
}

function lowerNativeEmbeds(source: string): string {
  return replaceKeywordBlocks(source, "embed", (body) => {
    const calls = body
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = /^([A-Za-z_$][\w$]*):?\s+(.+)$/u.exec(line);
        if (!match) {
          return "";
        }
        const name = match[1] ?? "";
        const value = match[2] ?? "";
        return `.${name}(${value.trim()})`;
      })
      .join("\n  ");
    return `Embed.create()\n  ${calls}`;
  });
}

function lowerNativeObjectCalls(source: string): string {
  return replaceCallBlocks(source, /((?:await\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\{/gu, (callee, body) => {
    const properties = body
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = /^([A-Za-z_$][\w$]*):?\s+(.+)$/u.exec(line);
        if (!match) {
          return line;
        }
        const name = match[1] ?? "";
        const value = match[2] ?? "";
        return `${name}: ${value.trim()},`;
      })
      .join("\n  ");
    return `${callee}({\n  ${properties}\n})`;
  });
}

function replaceNamedBlocks(source: string, pattern: RegExp, replacer: (name: string, body: string) => string): string {
  return replaceBlocks(source, pattern, (match, body) => replacer(match[1] ?? "bot", body));
}

function replaceKeywordBlocks(source: string, keyword: string, replacer: (body: string) => string): string {
  return replaceBlocks(source, new RegExp(`\\b${keyword}\\s*\\{`, "gu"), (_match, body) => replacer(body));
}

function replaceCallBlocks(source: string, pattern: RegExp, replacer: (callee: string, body: string) => string): string {
  return replaceBlocks(source, pattern, (match, body) => replacer((match[1] ?? "").trim(), body));
}

function replaceBlocks(source: string, pattern: RegExp, replacer: (match: RegExpMatchArray, body: string) => string): string {
  let output = "";
  let cursor = 0;
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const openIndex = source.indexOf("{", match.index);
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex < 0) {
      continue;
    }
    output += source.slice(cursor, match.index);
    output += replacer(match, source.slice(openIndex + 1, closeIndex));
    cursor = closeIndex + 1;
    pattern.lastIndex = closeIndex + 1;
  }
  output += source.slice(cursor);
  return output;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function addStrictDiagnostics(source: string, filename: string, diagnostics: Diagnostic[]): void {
  const anyPattern = /\bany\b/gu;
  for (const match of source.matchAll(anyPattern)) {
    const index = match.index ?? 0;
    const position = positionOf(source, index);
    diagnostics.push({
      code: "YURI101",
      message: "Avoid 'any' in strict Tsundere code.",
      filename,
      line: position.line,
      column: position.column,
      severity: "warning",
      hint: "Prefer unknown, a typed Discord object, or a generic constraint."
    });
  }
}

function createSourceMap(filename: string, emittedFile: string, source: string): string {
  return JSON.stringify({
    version: 3,
    file: emittedFile,
    sources: [filename],
    sourcesContent: [source],
    names: [],
    mappings: ""
  });
}
