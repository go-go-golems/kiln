import type { CaptureSummary } from '@/lang/ir';
import { stableStringify } from '@/lang/util';

/**
 * A capture as the server receives it. The spec is normalized through stableStringify (undefined → null,
 * functions → their hash) so that the server, re-hashing it, arrives at the same content hash.
 */
export const toWire = (c: CaptureSummary) => ({
  hash: c.hash,
  ref: c.ref,
  host: c.host,
  reps: c.reps,
  spec: JSON.parse(stableStringify(c.lowered)) as Record<string, unknown>,
});
