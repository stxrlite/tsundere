import { createHash, randomBytes } from "node:crypto";
import type { ProtectProfile } from "../types.js";

export interface ProtectOptions {
  profile: ProtectProfile;
  seed?: string | undefined;
}

export interface ProtectResult {
  code: string;
  buildId: string;
}

export function protectJavaScript(source: string, options: ProtectOptions): ProtectResult {
  const buildId = buildFingerprint(options);
  const key = createKey(options, buildId);
  let code = stripSourceMap(stripComments(source));
  code = encodeStrings(code, key);
  code = `const __tsundere_build="${buildId}";\n${code}`;
  if (options.profile === "advanced" || options.profile === "maximum") {
    code = injectDeadCode(code, key);
    code = injectIntegrityCheck(code, buildId);
  }
  if (options.profile === "maximum") {
    code = injectMaximumWrapper(code, key);
  }
  code = minifyWhitespace(code);
  return { code, buildId };
}

function buildFingerprint(options: ProtectOptions): string {
  const entropy = options.seed && options.seed !== "auto" ? options.seed : randomBytes(16).toString("hex");
  const time = options.seed && options.seed !== "auto" ? "" : `:${Date.now()}`;
  const hash = createHash("sha256").update(`${options.profile}:${entropy}${time}`).digest("hex").toUpperCase();
  return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

function createKey(options: ProtectOptions, buildId: string): number {
  const seed = options.seed ?? randomBytes(8).toString("hex");
  const hash = createHash("sha256").update(`${options.profile}:${buildId}:${seed}`).digest();
  return hash[0] || 113;
}

function stripSourceMap(source: string): string {
  return source.replace(/\/\/# sourceMappingURL=.*$/gmu, "");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

function encodeStrings(source: string, key: number): string {
  const imports: string[] = [];
  let protectedSource = source.replace(/^\s*import\s+.*$/gmu, (line) => {
    imports.push(line);
    return `__TSUNDERE_IMPORT_${imports.length - 1}__`;
  });
  protectedSource = protectedSource.replace(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/gu, (match, quote: string, value: string) => {
    if (quote === "`" && /\$\{/u.test(value)) {
      return match;
    }
    const encrypted = Buffer.from([...value].map((char) => char.charCodeAt(0) ^ key)).toString("base64");
    return `__tsundere_s("${encrypted}")`;
  });
  protectedSource = protectedSource.replace(/__TSUNDERE_IMPORT_(\d+)__/gu, (_match, index: string) => imports[Number(index)] ?? "");
  const decoder = `const __tsundere_s=(v)=>Array.from(Buffer.from(v,"base64")).map(c=>String.fromCharCode(c^${key})).join("");`;
  return `${decoder}\n${protectedSource}`;
}

function injectDeadCode(source: string, key: number): string {
  const name = `__tsundere_${key.toString(16)}_guard`;
  const dead = `const ${name}=()=>{const q=${key}*${key};return q>0?${key}:${key + 1};};${name}();`;
  return `${dead}\n${source}`;
}

function injectIntegrityCheck(source: string, buildId: string): string {
  const token = createHash("sha256").update(`${buildId}:${source.length}`).digest("hex").slice(0, 16);
  const check = `const __tsundere_integrity="${token}";if(!__tsundere_integrity||__tsundere_integrity.length!==16){process.exit(93);}`;
  return `${check}\n${source}`;
}

function injectMaximumWrapper(source: string, key: number): string {
  const gate = `const __tsundere_vm_${key}=(()=>${key}^${key << 1})();`;
  return `${gate}\n${source}`;
}

function minifyWhitespace(source: string): string {
  return source
    .replace(/\s+/gu, " ")
    .replace(/\s*([{}()[\];,:+\-*/<>=?])\s*/gu, "$1")
    .trim();
}
