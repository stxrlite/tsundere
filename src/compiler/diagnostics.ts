import type { Diagnostic } from "../types.js";

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const label = diagnostic.severity === "error" ? "error" : "warning";
  const location = `${diagnostic.filename}:${diagnostic.line}:${diagnostic.column}`;
  const hint = diagnostic.hint ? `\n  hint: ${diagnostic.hint}` : "";
  return `${label} ${diagnostic.code} at ${location}\n  ${diagnostic.message}${hint}`;
}

export function positionOf(source: string, index: number): { line: number; column: number } {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/u);
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1
  };
}
