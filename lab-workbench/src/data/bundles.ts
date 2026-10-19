import { makeValue, type Value } from '@/lang/values';
import { server } from '@/services/server';
import type { GeneratedRun } from './generate';

/** Measured runs fetched from the lab server, by capture hash; repetitions in order. */
const cache = new Map<string, GeneratedRun[]>();

export const bundlesLoaded = (hash: string) => cache.has(hash);
export const bundleRun = (hash: string, rep: number) => cache.get(hash)?.find((b) => b.run.rep === rep);
export const dropBundles = (hash: string) => cache.delete(hash);

/** JSON loses the value prototype; records keep their `__value` marker and are rebuilt here. */
export function revive<T>(x: T): T {
  if (Array.isArray(x)) return x.map(revive) as T;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = revive(v);
    if (o.__value === true) {
      const { __value: _marker, ...fields } = out;
      return makeValue(fields as Omit<Value, '__value'>) as T;
    }
    return out as T;
  }
  return x;
}

const inflight = new Map<string, Promise<number>>();

/** Fetches the bundles of measured hashes not yet loaded; returns how many hashes were loaded. Concurrent calls share one request. */
export function loadBundles(hashes: string[]): Promise<number> {
  const todo = [...new Set(hashes)].filter((h) => !cache.has(h) && !inflight.has(h));
  if (!todo.length) return Promise.all(hashes.map((h) => inflight.get(h))).then(() => 0);
  const p = fetchBundles(todo).finally(() => todo.forEach((h) => inflight.delete(h)));
  todo.forEach((h) => inflight.set(h, p));
  return p;
}

async function fetchBundles(todo: string[]): Promise<number> {
  let loaded = 0;
  for (let i = 0; i < todo.length; i += 16) {
    const batch = todo.slice(i, i + 16);
    const res = await server.get<Record<string, GeneratedRun[]>>(`/bundles?hashes=${batch.join(',')}`, 60_000);
    for (const h of batch) {
      // remembered even when empty, so a build cannot refetch it in a loop; an import drops the entry
      const runs = res[h] ?? [];
      cache.set(h, revive(runs));
      if (runs.length) loaded++;
    }
  }
  return loaded;
}
