import { gunzipSync, gzipSync } from 'node:zlib';

/** Entities and links are stored as gzip-compressed JSON; value records keep their `__value` marker. */
export const pack = (x: unknown): Uint8Array => gzipSync(Buffer.from(JSON.stringify(x), 'utf8'));
export const unpack = <T>(b: Uint8Array): T => JSON.parse(gunzipSync(b).toString('utf8')) as T;
