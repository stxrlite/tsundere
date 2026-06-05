export type TsundereTarget = "javascript" | "typescript";
export type ProtectProfile = "standard" | "advanced" | "maximum";

export interface TsundereConfig {
  name: string;
  source: string;
  outDir: string;
  target: TsundereTarget;
  strict: boolean;
  sourceMaps: boolean;
  storePath?: string;
  linkMode?: "auto" | "hardlink" | "copy";
  strictDependencies?: boolean;
  themeLogs?: boolean;
  runtime?: "node" | "bun" | "deno" | "cloudflare" | "vercel" | "netlify" | "aws-lambda" | "azure-functions";
  plugins?: string[];
  enterprise?: {
    monorepo?: boolean;
    workspaceRoot?: string;
    internalRegistry?: string;
    productionOptimizations?: boolean;
  };
  discord?: {
    tokenEnv?: string;
    defaultIntents?: string[];
  };
  commands?: CommandDiscoveryConfig;
}

export interface CommandDiscoveryConfig {
  discovery?: boolean;
  routeBased?: boolean;
  directory?: string;
  groups?: Record<string, CommandGroupOverride>;
}

export interface CommandGroupOverride {
  routeBased?: boolean;
  groupName?: string;
}

export interface CompileOptions {
  filename: string;
  source: string;
  target: TsundereTarget;
  sourceMaps: boolean;
  strict: boolean;
}

export interface CompileResult {
  code: string;
  map?: string;
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  code: string;
  message: string;
  filename: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  hint?: string;
}
