// An `nsys export --type sqlite` file read with node:sqlite (guide §20.5): kernels, memory copies, NVTX ranges and
// CUDA runtime calls, with names resolved through StringIds. The bytes are written to a temporary file and opened
// read-only; a table nsys did not write (no NVTX in the trace, say) reads as empty.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { NsysTables } from '@kiln/exec';

type Row = Record<string, number | string | null>;

export function readNsys(bytes: Uint8Array): NsysTables | null {
  const dir = mkdtempSync(join(tmpdir(), 'kiln-nsys-'));
  const file = join(dir, 'trace.sqlite');
  try {
    writeFileSync(file, bytes);
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const tables = new Set((db.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]).map((r) => r.name));
      const rows = (table: string, sql: string): Row[] => (tables.has(table) ? (db.prepare(sql).all() as Row[]) : []);
      if (!['CUPTI_ACTIVITY_KIND_KERNEL', 'CUPTI_ACTIVITY_KIND_RUNTIME', 'NVTX_EVENTS'].some((t) => tables.has(t))) return null;
      const strings = new Map<number, string>(rows('StringIds', 'select id, value from StringIds').map((r) => [Number(r.id), String(r.value)]));
      const str = (id: unknown) => (id === null || id === undefined ? '' : (strings.get(Number(id)) ?? String(id)));
      const num = (x: unknown) => Number(x ?? 0);
      return {
        kernels: rows('CUPTI_ACTIVITY_KIND_KERNEL', 'select * from CUPTI_ACTIVITY_KIND_KERNEL order by start').map((r) => ({
          start: num(r.start), end: num(r.end), deviceId: num(r.deviceId), streamId: num(r.streamId),
          name: str(r.shortName ?? r.demangledName ?? r.mangledName), correlationId: num(r.correlationId),
          grid: [num(r.gridX), num(r.gridY), num(r.gridZ)], block: [num(r.blockX), num(r.blockY), num(r.blockZ)], registers: num(r.registersPerThread),
        })),
        copies: rows('CUPTI_ACTIVITY_KIND_MEMCPY', 'select * from CUPTI_ACTIVITY_KIND_MEMCPY order by start').map((r) => ({
          start: num(r.start), end: num(r.end), bytes: num(r.bytes), copyKind: num(r.copyKind), deviceId: num(r.deviceId), streamId: num(r.streamId),
        })),
        ranges: rows('NVTX_EVENTS', 'select * from NVTX_EVENTS where eventType in (59, 60) order by start').map((r) => ({
          start: num(r.start), end: r.end === null ? null : num(r.end), text: r.text !== null && r.text !== undefined ? String(r.text) : str(r.textId), tid: num(r.globalTid),
        })),
        calls: rows('CUPTI_ACTIVITY_KIND_RUNTIME', 'select * from CUPTI_ACTIVITY_KIND_RUNTIME order by start').map((r) => ({
          start: num(r.start), end: num(r.end), name: str(r.nameId), correlationId: num(r.correlationId), tid: num(r.globalTid),
        })),
      };
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
