import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { GraphDocs, GraphFunction, GraphParameter, GraphProperty, TypeGraph, TypeGraphNode, TypeSource } from "./graph.js";

const discordPackages = [
  "discord.js",
  "@discordjs/builders",
  "discord-api-types",
  "@discordjs/rest",
  "@discordjs/ws",
  "@tsundere/discord"
];

export interface ExtractOptions {
  cwd: string;
  packages?: string[];
}

export async function extractDiscordTypeGraph(options: ExtractOptions): Promise<TypeGraph> {
  const packageNames = options.packages ?? discordPackages;
  const sources = await findTypeSources(options.cwd, packageNames);
  const files = sources.flatMap((source) => source.files);

  if (files.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      sources,
      nodes: fallbackTsundereDiscordGraph()
    };
  }

  const ts = await loadTypeScript();
  const program = ts.createProgram(files, {
    allowJs: false,
    declaration: true,
    emitDeclarationOnly: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true
  });
  const checker = program.getTypeChecker();
  const nodes: TypeGraphNode[] = [];
  const fileSet = new Set(files.map(normalizePath));

  for (const sourceFile of program.getSourceFiles()) {
    if (!fileSet.has(normalizePath(sourceFile.fileName))) {
      continue;
    }
    const packageName = sources.find((source) => source.files.map(normalizePath).includes(normalizePath(sourceFile.fileName)))?.packageName ?? "unknown";
    sourceFile.forEachChild((node: unknown) => {
      const extracted = extractNode(ts, checker, node, packageName);
      if (extracted) {
        nodes.push(extracted);
      }
    });
  }

  return { generatedAt: new Date().toISOString(), sources, nodes };
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").toLowerCase();
}

export async function findTypeSources(cwd: string, packageNames = discordPackages): Promise<TypeSource[]> {
  const sources: TypeSource[] = [];
  for (const packageName of packageNames) {
    const packageRoot = resolvePackageRoot(cwd, packageName);
    if (!packageRoot) {
      continue;
    }
    const packageJsonPath = join(packageRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: string; types?: string; typings?: string; main?: string };
    const entry = packageJson.types ?? packageJson.typings ?? packageJson.main ?? "index.d.ts";
    const files = await collectTypeFiles(resolve(packageRoot, entry), packageRoot);
    sources.push({
      packageName,
      version: packageJson.version ?? "0.0.0",
      files,
      hash: await hashFiles([packageJsonPath, ...files])
    });
  }
  return sources;
}

export async function createTypeCacheKey(cwd: string, graph: TypeGraph): Promise<string> {
  const lockfiles = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]
    .map((file) => resolve(cwd, file))
    .filter((file) => existsSync(file));
  const input = JSON.stringify({
    sources: graph.sources.map((source) => ({ packageName: source.packageName, version: source.version, hash: source.hash })),
    lockHash: await hashFiles(lockfiles),
    compiler: "tsundere-0.1.0",
    yurils: "0.1.0"
  });
  return createHash("sha256").update(input).digest("hex");
}

async function loadTypeScript(): Promise<any> {
  try {
    const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
    return await importer("typescript");
  } catch {
    throw new Error("The TypeScript package is required for `tsundere types sync`. Install dependencies with `tsundere install`.");
  }
}

function extractNode(ts: any, checker: any, node: any, packageName: string): TypeGraphNode | undefined {
  if (ts.isClassDeclaration(node) && node.name) {
    return {
      name: node.name.text,
      kind: "class",
      packageName,
      exportPath: packageName,
      extends: heritageNames(node),
      typeParameters: node.typeParameters?.map((param: any) => param.name.text),
      constructors: node.members.filter(ts.isConstructorDeclaration).map((member: any) => extractFunction(ts, checker, member, "constructor")),
      methods: node.members.filter(ts.isMethodDeclaration).map((member: any) => extractFunction(ts, checker, member, member.name.getText())),
      properties: node.members.filter(ts.isPropertyDeclaration).map((member: any) => extractProperty(ts, checker, member)),
      docs: docsFor(ts, node),
      deprecated: deprecatedFor(ts, node)
    };
  }

  if (ts.isInterfaceDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "interface",
      packageName,
      exportPath: packageName,
      extends: heritageNames(node),
      typeParameters: node.typeParameters?.map((param: any) => param.name.text),
      methods: node.members.filter(ts.isMethodSignature).map((member: any) => extractFunction(ts, checker, member, member.name.getText())),
      properties: node.members.filter(ts.isPropertySignature).map((member: any) => extractProperty(ts, checker, member)),
      docs: docsFor(ts, node),
      deprecated: deprecatedFor(ts, node)
    };
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "type",
      packageName,
      exportPath: packageName,
      typeParameters: node.typeParameters?.map((param: any) => param.name.text),
      type: node.type.getText(),
      docs: docsFor(ts, node),
      deprecated: deprecatedFor(ts, node)
    };
  }

  if (ts.isEnumDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "enum",
      packageName,
      exportPath: packageName,
      values: node.members.map((member: any) => ({ name: member.name.getText(), value: member.initializer?.getText(), docs: docsFor(ts, member) })),
      docs: docsFor(ts, node),
      deprecated: deprecatedFor(ts, node)
    };
  }

  if (ts.isFunctionDeclaration(node) && node.name) {
    return {
      name: node.name.text,
      kind: "function",
      packageName,
      exportPath: packageName,
      methods: [extractFunction(ts, checker, node, node.name.text)],
      docs: docsFor(ts, node),
      deprecated: deprecatedFor(ts, node)
    };
  }

  return undefined;
}

function extractFunction(ts: any, checker: any, node: any, name: string): GraphFunction {
  const signature = checker.getSignatureFromDeclaration(node);
  const returns = signature ? checker.typeToString(checker.getReturnTypeOfSignature(signature)) : "void";
  return {
    name: cleanName(name),
    parameters: node.parameters.map((param: any) => extractParameter(ts, checker, param)),
    returns,
    typeParameters: node.typeParameters?.map((param: any) => param.name.text),
    docs: docsFor(ts, node),
    deprecated: deprecatedFor(ts, node)
  };
}

function extractParameter(ts: any, checker: any, param: any): GraphParameter {
  return {
    name: param.name.getText(),
    type: param.type ? param.type.getText() : checker.typeToString(checker.getTypeAtLocation(param)),
    optional: Boolean(param.questionToken || param.initializer),
    docs: docsFor(ts, param).description
  };
}

function extractProperty(ts: any, checker: any, property: any): GraphProperty {
  return {
    name: cleanName(property.name.getText()),
    type: property.type ? property.type.getText() : checker.typeToString(checker.getTypeAtLocation(property)),
    optional: Boolean(property.questionToken),
    readonly: property.modifiers?.some((modifier: any) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false,
    docs: docsFor(ts, property),
    deprecated: deprecatedFor(ts, property)
  };
}

function docsFor(ts: any, node: any): GraphDocs {
  const tags = ts.getJSDocTags(node);
  const comments = ts.getJSDocCommentsAndTags(node)
    .map((comment: any) => comment.getText().replace(/^\/\*\*|\*\/$/gu, "").replace(/^\s*\*\s?/gmu, "").trim())
    .filter(Boolean);
  const params: Record<string, string> = {};
  const examples: string[] = [];
  const links: string[] = [];
  let returns: string | undefined;
  for (const tag of tags) {
    const text = typeof tag.comment === "string" ? tag.comment : "";
    if (ts.isJSDocParameterTag(tag)) {
      params[tag.name.getText()] = text;
    } else if (tag.tagName.text === "returns" || tag.tagName.text === "return") {
      returns = text;
    } else if (tag.tagName.text === "example") {
      examples.push(text);
    } else if (tag.tagName.text === "see" || tag.tagName.text === "link") {
      links.push(text);
    }
  }
  return {
    description: comments[0],
    params: Object.keys(params).length > 0 ? params : undefined,
    returns,
    examples: examples.length > 0 ? examples : undefined,
    links: links.length > 0 ? links : undefined
  };
}

function deprecatedFor(ts: any, node: any): string | undefined {
  const tag = ts.getJSDocTags(node).find((item: any) => item.tagName.text === "deprecated");
  return typeof tag?.comment === "string" ? tag.comment : tag ? "Deprecated." : undefined;
}

function heritageNames(node: any): string[] | undefined {
  const names = node.heritageClauses?.flatMap((clause: any) => clause.types.map((type: any) => type.expression.getText())) ?? [];
  return names.length > 0 ? names : undefined;
}

function cleanName(name: string): string {
  return name.replace(/^["']|["']$/gu, "");
}

function resolvePackageRoot(cwd: string, packageName: string): string | undefined {
  const root = resolve(cwd, "node_modules", ...packageName.split("/"));
  return existsSync(join(root, "package.json")) ? root : undefined;
}

async function collectTypeFiles(entry: string, packageRoot: string): Promise<string[]> {
  const files: string[] = [];
  if (existsSync(entry) && isTypeFile(entry)) {
    files.push(entry);
  }
  await walkTypes(packageRoot, files);
  return [...new Set(files)].slice(0, 1000);
}

async function walkTypes(root: string, files: string[]): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "node_modules" || (entry.name === "dist" && files.length > 0)) {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await walkTypes(path, files);
    } else if (entry.isFile() && isTypeFile(path)) {
      files.push(path);
    }
  }
}

function isTypeFile(path: string): boolean {
  return /\.(d\.)?[cm]?ts$/u.test(path);
}

async function hashFiles(files: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of files) {
    const info = await stat(file).catch(() => undefined);
    if (!info) {
      continue;
    }
    hash.update(file);
    hash.update(String(info.size));
    hash.update(String(info.mtimeMs));
  }
  return hash.digest("hex");
}

function fallbackTsundereDiscordGraph(): TypeGraphNode[] {
  return [
    {
      name: "Client",
      kind: "class",
      packageName: "@tsundere/discord",
      exportPath: "@tsundere/discord",
      methods: [
        { name: "on", parameters: [{ name: "event", type: "string", optional: false }, { name: "listener", type: "Function", optional: false }], returns: "this" },
        { name: "once", parameters: [{ name: "event", type: "string", optional: false }, { name: "listener", type: "Function", optional: false }], returns: "this" },
        { name: "login", parameters: [{ name: "token", type: "string", optional: true }], returns: "Promise<void>" }
      ]
    },
    {
      name: "Interaction",
      kind: "interface",
      packageName: "@tsundere/discord",
      exportPath: "@tsundere/discord",
      methods: [
        { name: "reply", parameters: [{ name: "options", type: "InteractionResponse", optional: false }], returns: "Promise<void>" },
        { name: "deferReply", parameters: [{ name: "options", type: "ReplyOptions", optional: true }], returns: "Promise<void>" },
        { name: "editReply", parameters: [{ name: "options", type: "InteractionResponse", optional: false }], returns: "Promise<void>" },
        { name: "followUp", parameters: [{ name: "options", type: "InteractionResponse", optional: false }], returns: "Promise<void>" }
      ]
    }
  ];
}
