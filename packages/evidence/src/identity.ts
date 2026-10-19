// Content identity (what executed) and device identity (where it executed). Both are SHA-256 over
// canonical JSON, so evidence for a changed kernel or a different GPU can never be mistaken for the
// current one (guide §22, §23; fixes K-3 and P-5).
import { canonicalJSON } from './canonical.ts';
import { isSha256Hex, sha256Hex } from './sha256.ts';

export type Lang = 'cuda' | 'wgsl' | 'sim';
export type DeviceClass = 'sim' | 'webgpu' | 'cuda';
export type Fingerprint = Record<string, string | number | boolean>;

export interface Launch {
  grid: number;
  block: number;
  smem: number;
}

export interface ContentIdInput {
  /** Bumped when code generation semantics change (CODEGEN_VERSION) */
  codegen: string;
  lang: Lang;
  /** sha256Hex of canonicalSource(source text in `lang`, entry symbol): CUDA, WGSL, or the Kernel IR text for the simulator */
  sourceSha256: string;
  launch: Launch;
  /** One entry per kernel input: its shape and the seed its data is generated from */
  inputs: ReadonlyArray<{ shape: readonly number[]; seed: number }>;
  /** Shape of the output */
  output: readonly number[];
  /** For lang 'sim': sha256Hex(canonicalJSON(target spec)), the simulator's "hardware". Otherwise null. */
  target: string | null;
}

const LANGS: readonly string[] = ['cuda', 'wgsl', 'sim'];
const isCount = (x: unknown): boolean => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const isShape = (x: unknown): boolean => Array.isArray(x) && x.every(isCount);

/**
 * The source text a content id hashes: the generated source with the kernel's own entry symbol replaced by
 * `kernel`. The symbol is a name, not behaviour: two kernels of one program that compute the same thing on the
 * same shapes (W-19's unfused GELU has two) execute the same code and get the same content id, so measuring one
 * measures both. Only whole-word occurrences are replaced, so `k_ew` leaves `k_ew_2` alone.
 */
export function canonicalSource(text: string, symbol: string): string {
  if (typeof text !== 'string') throw new TypeError('canonicalSource: text must be a string');
  if (typeof symbol !== 'string' || !/^\w+$/.test(symbol)) throw new TypeError(`canonicalSource: symbol must be an identifier (got ${JSON.stringify(symbol)})`);
  return text.replace(new RegExp(`\\b${symbol}\\b`, 'g'), 'kernel');
}

/** sha256 of the canonical description of an executable kernel (guide §22). Throws TypeError on a malformed input. */
export function contentId(k: ContentIdInput): string {
  const bad = (what: string): never => { throw new TypeError(`contentId: ${what}`); };
  if (typeof k.codegen !== 'string' || !k.codegen) bad('codegen must be a non-empty string');
  if (!LANGS.includes(k.lang)) bad(`lang must be one of ${LANGS.join(', ')} (got ${String(k.lang)})`);
  if (!isSha256Hex(k.sourceSha256)) bad('sourceSha256 must be a sha256 hex digest');
  if (!k.launch || !isCount(k.launch.grid) || !isCount(k.launch.block) || !isCount(k.launch.smem)) bad('launch must be {grid, block, smem} non-negative integers');
  if (!Array.isArray(k.inputs) || !k.inputs.every((x) => x && isShape(x.shape) && Number.isFinite(x.seed))) bad('inputs must be [{shape: int[], seed: number}]');
  if (!isShape(k.output)) bad('output must be a shape (non-negative integers)');
  if (k.lang === 'sim' ? !isSha256Hex(k.target) : k.target !== null) bad(k.lang === 'sim' ? 'target must be the sha256 of the target spec for lang "sim"' : 'target must be null unless lang is "sim"');
  return sha256Hex(canonicalJSON({
    codegen: k.codegen,
    lang: k.lang,
    source: k.sourceSha256,
    launch: { grid: k.launch.grid, block: k.launch.block, smem: k.launch.smem },
    inputs: k.inputs.map((x) => ({ shape: [...x.shape], seed: x.seed })),
    output: [...k.output],
    target: k.target,
  }));
}

/** Lowercase, ASCII alphanumerics and single hyphens: "Apple M3 Max (Metal 3)" → "apple-m3-max-metal-3". */
export function slug(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '') || 'device';
}

/**
 * `<class>:<slug of name>-<first 8 hex of sha256(canonicalJSON(fingerprint))>` for real devices (guide §23).
 * A simulator's id is `sim:<slug of name>` with no hash: pass the target key (`rtx5090`), and spec changes are
 * caught by the content id, whose `target` is the spec's hash.
 */
export function deviceId(cls: DeviceClass, name: string, fingerprint: Fingerprint): string {
  if (cls !== 'sim' && cls !== 'webgpu' && cls !== 'cuda') throw new TypeError(`deviceId: unknown device class ${String(cls)}`);
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('deviceId: name must be a non-empty string');
  if (!isFingerprint(fingerprint)) throw new TypeError('deviceId: fingerprint must be a flat object of strings, finite numbers and booleans');
  if (cls === 'sim') return `sim:${slug(name)}`;
  return `${cls}:${slug(name)}-${sha256Hex(canonicalJSON(fingerprint)).slice(0, 8)}`;
}

export function isFingerprint(x: unknown): x is Fingerprint {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(x).every((v) => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)));
}

/**
 * The identity of a CUDA GPU from the runner's device report (guide §23), for the page and the server alike. Every
 * scalar field of the report enters the fingerprint; the runner reports only stable facts, including the machine's
 * own `hostname` and, with nvidia-smi, the GPU's UUID. The same GPU therefore gets the same id whether it was reached
 * through the runner's page, an SSH executor or an imported results file. `fallbackHost` is used only for reports
 * from runners that predate the `hostname` field.
 */
export function cudaDevice(report: Record<string, unknown>, fallbackHost: string): { id: string; name: string; fingerprint: Fingerprint } {
  const fingerprint: Fingerprint = {};
  for (const [k, v] of Object.entries(report ?? {})) if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) fingerprint[k] = v;
  if (typeof fingerprint.hostname !== 'string' || !fingerprint.hostname) fingerprint.host = String(fallbackHost);
  const model = typeof report?.name === 'string' && report.name.trim() ? report.name.trim() : '';
  return { id: deviceId('cuda', model || 'cuda', fingerprint), name: `CUDA ${model}`.trim(), fingerprint };
}
