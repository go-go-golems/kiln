// Perf Lab's capture identity: a capture is named by cyrb53 of its stable-stringified lowered spec
// (PL/src/lang/util.ts). The server recomputes it for every capture it is sent, so content addressing cannot be
// forged, and the importer recomputes it for every artifact it copies. cyrb53 is not SHA-256 (guide D3); it is kept
// here because it is the identity every existing Perf Lab artifact, bundle and program already uses.

/** cyrb53: a 53-bit string hash rendered as 13–14 hex digits. Not cryptographic; identity only. */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(13, '0');
}

/**
 * JSON with sorted keys, as Perf Lab's stableStringify renders JSON values: undefined becomes null, keys starting
 * with `__fn` are dropped, and an object met a second time on the walk is rendered '[cycle]'. Functions and regular
 * expressions cannot arrive in a JSON body, so their branches are not ported.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === undefined) return null;
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[cycle]';
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      if (k.startsWith('__fn')) continue;
      out[k] = walk((v as Record<string, unknown>)[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

export const captureHash = (spec: unknown): string => cyrb53(stableStringify(spec));

export interface CaptureInput {
  hash: string;
  /** experiment/arm/mode */
  ref: string;
  host: string;
  reps: number;
  spec: Record<string, unknown>;
}

export const splitRef = (ref: string): { experiment: string; arm: string; mode: string } => {
  const [experiment = '', arm = '', mode = ''] = ref.split('/');
  return { experiment, arm, mode };
};

const REF = /^[^/]+\/[^/]+\/[^/#]+$/;

export type CaptureCheck = { ok: true; captures: CaptureInput[] } | { ok: false; status: 400 | 409; error: string; message: string; ref?: string };

/** Perf Lab's validateCaptures (PL/server/app.ts): shape, reference syntax, repetitions in 1..64, and the hash. */
export function validateCaptures(raw: unknown): CaptureCheck {
  const bad = (message: string): CaptureCheck => ({ ok: false, status: 400, error: 'bad_request', message });
  if (!Array.isArray(raw) || raw.length === 0) return bad('captures must be a non-empty array');
  const captures: CaptureInput[] = [];
  for (const x of raw as unknown[]) {
    const c = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
    if (typeof c.hash !== 'string' || typeof c.ref !== 'string' || typeof c.host !== 'string' || !c.spec || typeof c.spec !== 'object' || Array.isArray(c.spec))
      return bad('each capture needs hash, ref, host, reps and spec');
    if (!REF.test(c.ref)) return bad(`capture ref must be experiment/arm/mode, got ${c.ref}`);
    const actual = captureHash(c.spec);
    if (actual !== c.hash) return { ok: false, status: 409, error: 'spec_hash_mismatch', message: `spec of ${c.ref} hashes to ${actual}, not ${c.hash}`, ref: c.ref };
    const reps = Number(c.reps);
    if (!Number.isInteger(reps) || reps < 1 || reps > 64) return bad(`reps must be an integer in 1..64 (${c.ref})`);
    captures.push({ hash: c.hash, ref: c.ref, host: c.host, reps, spec: c.spec as Record<string, unknown> });
  }
  return { ok: true, captures };
}
