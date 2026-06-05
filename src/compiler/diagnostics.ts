import type { Diagnostic } from "../types.js";

interface DiagnosticFormatOptions {
  color?: boolean;
  verbose?: boolean;
}

const colors = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m"
};

export function formatDiagnostic(diagnostic: Diagnostic, options: DiagnosticFormatOptions = {}): string {
  const label = diagnostic.severity === "error" ? "error" : "warning";
  const location = `${diagnostic.filename}:${diagnostic.line}:${diagnostic.column}`;
  const head = paint(label, diagnostic.severity === "error" ? colors.red : colors.yellow, options.color);
  const code = paint(diagnostic.code, colors.cyan, options.color);
  const place = paint(location, colors.dim, options.color);
  if (!options.verbose) {
    return `${head} ${code} ${place} ${diagnostic.message}`;
  }
  const hint = diagnostic.hint ? `\n  ${paint("hint:", colors.dim, options.color)} ${diagnostic.hint}` : "";
  return `${head} ${code} ${place}\n  ${diagnostic.message}${hint}`;
}

export function positionOf(source: string, index: number): { line: number; column: number } {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/u);
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1
  };
}

function paint(value: string, color: string, enabled?: boolean): string {
  return enabled ? `${color}${value}${colors.reset}` : value;
}
