export interface TsunderePlugin {
  name: string;
  version: string;
  compiler?: CompilerPlugin;
  languageServer?: LanguageServerPlugin;
  lint?: LintPlugin;
  cli?: CliPlugin;
  generators?: Record<string, CodeGenerator>;
}

export interface CompilerPlugin {
  syntaxExtensions?: SyntaxExtension[];
  transform?(context: CompilerPluginContext): Promise<void> | void;
}

export interface LanguageServerPlugin {
  completions?(context: LanguageServerContext): CompletionItem[];
  diagnostics?(context: LanguageServerContext): PluginDiagnostic[];
  hover?(context: LanguageServerContext): HoverInfo | undefined;
}

export interface LintPlugin {
  rules: LintRule[];
}

export interface CliPlugin {
  commands: CliCommand[];
}

export interface CodeGenerator {
  description: string;
  generate(input: GeneratorInput): GeneratedFile[];
}

export interface SyntaxExtension {
  name: string;
  grammar: "expression" | "statement" | "declaration" | "decorator";
}

export interface CompilerPluginContext {
  projectRoot: string;
  files: string[];
  emit(file: string, contents: string): void;
}

export interface LanguageServerContext {
  uri: string;
  source: string;
  offset: number;
  imports: string[];
}

export interface CompletionItem {
  label: string;
  kind: "class" | "function" | "method" | "property" | "enum" | "keyword" | "snippet";
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface PluginDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  start: number;
  end: number;
}

export interface HoverInfo {
  markdown: string;
}

export interface LintRule {
  name: string;
  description: string;
  check(context: LanguageServerContext): PluginDiagnostic[];
}

export interface CliCommand {
  name: string;
  description: string;
  run(args: string[]): Promise<number>;
}

export interface GeneratorInput {
  name: string;
  projectRoot: string;
  options: Record<string, string | boolean>;
}

export interface GeneratedFile {
  path: string;
  contents: string;
}
