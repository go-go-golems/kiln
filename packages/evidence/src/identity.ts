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
  /** sha256Hex of the source text in `lang` (CUDA, WGSL, or the Kernel IR text for the simulator) */
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
