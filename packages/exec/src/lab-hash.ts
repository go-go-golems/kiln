// Perf Lab's capture identity: a lab capture is named by cyrb53 of its stable-stringified lowered spec
// (packages/lab/src/lang/util.ts computes the same). The server recomputes it for every lab capture it is sent, so a
// lab cannot claim another capture's runs, and the Perf Lab importer recomputes it for every artifact it copies.
// cyrb53 is not SHA-256; it is kept because it is the identity every existing Perf Lab artifact and program uses.

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

export const labCaptureHash = (spec: unknown): string => cyrb53(stableStringify(spec));
