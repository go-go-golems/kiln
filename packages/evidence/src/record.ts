// The measurement record (guide §21): every repetition of one kernel on one device under one protocol.
// The id is a content hash, so the same measurement imported twice is stored once, and the server
// recomputes it rather than trusting the client's.
import { canonicalJSON } from './canonical.ts';
import { isFingerprint, type DeviceClass, type Fingerprint, type Lang, type Launch } from './identity.ts';
import { isSha256Hex, sha256Hex } from './sha256.ts';

export const RECORD_FORMAT = 'kiln-measure/1';

export type TimingKind = 'simulated' | 'gpu-timestamp' | 'wall-clock' | 'cuda-events' | 'legacy';

export interface MeasurementRecord {
  format: typeof RECORD_FORMAT;
  /** sha256(canonicalJSON(record without id)) */
  id: string;
  /** ISO 8601 */
  at: string;
  by: 'measure' | 'tune' | 'job' | 'import';
  device: {
    /** 'sim:rtx5090' | 'webgpu:<slug>-<8 hex>' | 'cuda:<slug>-<8 hex>' | 'legacy:<old id>' */
    id: string;
    class: DeviceClass;
    name: string;
    fingerprint: Fingerprint;
  };
  kernel: {
    name: string;
    /** WHAT is computed (groups schedules) */
    identity: string;
    /** HOW it is mapped: the canonical schedule knobs */
    row: string;
    knobs: Record<string, string | number>;
    /** sha256 of what executed (contentId); '' only for legacy rows */
    contentId: string;
    lang: Lang;
    /** sha256 of the generated source; '' only for legacy rows */
    sourceSha256: string;
    launch: Launch;
  };
  timing: {
    kind: TimingKind;
    unit: 'us';
    /** One value per repetition: the median of that repetition's timed launches */
    samples: number[];
    launches?: number;
    warmup?: number;
    /** Per-launch times, per repetition */
    raw?: number[][];
  };
  counts?: Record<string, number>;
  /** Simulator counts are derived; ncu counters are observed */
  countsProv?: 'derived' | 'observed';
  check: { ok: boolean; sampled: number; maxAbsErr?: number; detail?: string };
  activation: { requested: string | null; materialized: string; ok: boolean; notes: string[] };
  validity: { ok: boolean; reasons: string[]; partial: string[] };
  protocol: { reps: number; seed: number; order?: number[]; pairId?: string; position?: number[] };
  manifest: { codegen: string; app: string; runner?: string; userAgent?: string; host?: string; [k: string]: unknown };
}

/** The record's id: sha256 of the canonical JSON of everything except `id`. Throws on non-canonical content. */
export function recordId(record: Omit<MeasurementRecord, 'id'> | MeasurementRecord): string {
  const { id: _id, ...rest } = record as MeasurementRecord;
  return sha256Hex(canonicalJSON(rest));
}

export type Validation = { ok: true; record: MeasurementRecord; errors: [] } | { ok: false; errors: string[] };

const TIMING: Record<DeviceClass, readonly TimingKind[]> = {
  sim: ['simulated'],
  webgpu: ['gpu-timestamp', 'wall-clock'],
  cuda: ['cuda-events'],
};
const LANG: Record<DeviceClass, Lang> = { sim: 'sim', webgpu: 'wgsl', cuda: 'cuda' };
const BY = ['measure', 'tune', 'job', 'import'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isFin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown, min = 0): x is number => Number.isInteger(x) && (x as number) >= min;
const isStrs = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

/**
 * Checks shape, the id, and the rules every producer follows (guide §21, §27):
 * - a valid record (validity.ok) passed its output and activation checks and has one sample per repetition;
 *   an invalid one says why (validity.reasons is not empty);
 * - the timing kind and language match the device class (simulated/sim, gpu-timestamp or wall-clock/wgsl,
 *   cuda-events/cuda); a wall-clock or legacy record lists its caveats in validity.partial;
 * - only a legacy record (timing kind 'legacy', device id 'legacy:…') may lack a content id.
 */
export function validateRecord(x: unknown): Validation {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  if (!isObj(x)) return { ok: false, errors: ['$: not an object'] };
  const r = x as Partial<MeasurementRecord> & Record<string, unknown>;

  if (r.format !== RECORD_FORMAT) err('format', `expected "${RECORD_FORMAT}"`);
  if (!isStr(r.at) || !ISO.test(r.at) || !Number.isFinite(Date.parse(r.at))) err('at', 'expected an ISO 8601 timestamp with a time zone');
  if (!BY.includes(r.by as string)) err('by', `expected one of ${BY.join(', ')}`);

  const legacy = isObj(r.timing) && r.timing.kind === 'legacy';
  const d = r.device;
  if (!isObj(d)) err('device', 'missing');
  else {
    if (!(d.class in TIMING)) err('device.class', 'expected sim, webgpu or cuda');
    if (!isStr(d.name) || !d.name) err('device.name', 'expected a non-empty string');
    if (!isFingerprint(d.fingerprint)) err('device.fingerprint', 'expected a flat object of strings, finite numbers and booleans');
    if (!isStr(d.id)) err('device.id', 'expected a string');
    else if (legacy ? !/^legacy:\S+$/.test(d.id) : !(d.id.startsWith(`${d.class}:`) && (d.class === 'sim' ? /^sim:[a-z0-9-]+$/ : /^[a-z]+:[a-z0-9-]+-[0-9a-f]{8}$/).test(d.id))) {
      err('device.id', legacy ? 'a legacy record\'s device id is "legacy:<old id>"' : `expected "${d.class}:<slug>${d.class === 'sim' ? '' : '-<8 hex>'}"`);
    }
  }

  const k = r.kernel;
  if (!isObj(k)) err('kernel', 'missing');
  else {
    for (const f of ['name', 'identity', 'row'] as const) if (!isStr(k[f]) || !k[f]) err(`kernel.${f}`, 'expected a non-empty string');
    if (!isObj(k.knobs) || !Object.values(k.knobs).every((v) => isStr(v) || isFin(v))) err('kernel.knobs', 'expected an object of strings and finite numbers');
    for (const f of ['contentId', 'sourceSha256'] as const) {
      if (!(isSha256Hex(k[f]) || (legacy && k[f] === ''))) err(`kernel.${f}`, legacy ? 'expected a sha256 hex digest or ""' : 'expected a sha256 hex digest');
    }
    if (!['cuda', 'wgsl', 'sim'].includes(k.lang as string)) err('kernel.lang', 'expected cuda, wgsl or sim');
    else if (!legacy && isObj(d) && d.class in LANG && k.lang !== LANG[d.class as DeviceClass]) err('kernel.lang', `a ${String(d.class)} device runs ${LANG[d.class as DeviceClass]}`);
    const l = k.launch;
    if (!isObj(l) || !isInt(l.grid) || !isInt(l.block) || !isInt(l.smem)) err('kernel.launch', 'expected {grid, block, smem} non-negative integers');
  }

  const t = r.timing;
  if (!isObj(t)) err('timing', 'missing');
  else {
    if (!(['simulated', 'gpu-timestamp', 'wall-clock', 'cuda-events', 'legacy'] as unknown[]).includes(t.kind)) err('timing.kind', 'unknown kind');
    else if (!legacy && isObj(d) && d.class in TIMING && !TIMING[d.class as DeviceClass].includes(t.kind as TimingKind)) err('timing.kind', `${String(t.kind)} is not a timing a ${String(d.class)} device produces`);
    if (t.unit !== 'us') err('timing.unit', 'expected "us"');
    if (!Array.isArray(t.samples) || !t.samples.every((v) => isFin(v) && v >= 0)) err('timing.samples', 'expected finite non-negative numbers');
    if (t.launches !== undefined && !isInt(t.launches, 1)) err('timing.launches', 'expected a positive integer');
    if (t.warmup !== undefined && !isInt(t.warmup)) err('timing.warmup', 'expected a non-negative integer');
    if (t.raw !== undefined) {
      if (!Array.isArray(t.raw) || !t.raw.every((rep) => Array.isArray(rep) && rep.every((v) => isFin(v) && v >= 0))) err('timing.raw', 'expected arrays of finite non-negative numbers');
      else if (Array.isArray(t.samples) && t.raw.length !== t.samples.length) err('timing.raw', 'expected one array per sample');
    }
  }

  if (r.counts !== undefined) {
    if (!isObj(r.counts) || !Object.values(r.counts).every(isFin)) err('counts', 'expected an object of finite numbers');
    if (r.countsProv !== 'derived' && r.countsProv !== 'observed') err('countsProv', 'counts need a provenance: derived or observed');
  } else if (r.countsProv !== undefined) err('countsProv', 'set without counts');

  const c = r.check;
  if (!isObj(c) || typeof c.ok !== 'boolean' || !isInt(c.sampled)) err('check', 'expected {ok: boolean, sampled: integer}');
  else {
    if (c.maxAbsErr !== undefined && !isFin(c.maxAbsErr)) err('check.maxAbsErr', 'expected a finite number');
    if (c.detail !== undefined && !isStr(c.detail)) err('check.detail', 'expected a string');
  }

  const a = r.activation;
  if (!isObj(a) || !(a.requested === null || isStr(a.requested)) || !isStr(a.materialized) || typeof a.ok !== 'boolean' || !isStrs(a.notes)) {
    err('activation', 'expected {requested: string | null, materialized: string, ok: boolean, notes: string[]}');
  }

  const v = r.validity;
  if (!isObj(v) || typeof v.ok !== 'boolean' || !isStrs(v.reasons) || !isStrs(v.partial)) err('validity', 'expected {ok: boolean, reasons: string[], partial: string[]}');

  const p = r.protocol;
  if (!isObj(p) || !isInt(p.reps, 1) || !isFin(p.seed)) err('protocol', 'expected {reps: positive integer, seed: number}');
  else {
    if (p.order !== undefined && !(Array.isArray(p.order) && p.order.every((i) => isInt(i)))) err('protocol.order', 'expected non-negative integers');
    if (p.position !== undefined && !(Array.isArray(p.position) && p.position.every((i) => isInt(i)))) err('protocol.position', 'expected non-negative integers');
    if (p.pairId !== undefined && (!isStr(p.pairId) || !p.pairId)) err('protocol.pairId', 'expected a non-empty string');
  }

  const m = r.manifest;
  if (!isObj(m) || !isStr(m.codegen) || !isStr(m.app)) err('manifest', 'expected {codegen: string, app: string}');
  else for (const f of ['runner', 'userAgent', 'host'] as const) if (m[f] !== undefined && !isStr(m[f])) err(`manifest.${f}`, 'expected a string');

  const known = new Set(['format', 'id', 'at', 'by', 'device', 'kernel', 'timing', 'counts', 'countsProv', 'check', 'activation', 'validity', 'protocol', 'manifest']);
  for (const key of Object.keys(r)) if (!known.has(key)) err(key, 'unknown field');

  // the rules that tie the parts together, checked only once the parts are well-formed
  if (!errors.length) {
    const rec = r as MeasurementRecord;
    if (rec.validity.ok) {
      if (!rec.check.ok) err('validity.ok', 'true, but the output check failed');
      if (!rec.activation.ok) err('validity.ok', 'true, but the activation check failed');
      if (rec.timing.samples.length !== rec.protocol.reps) err('validity.ok', `true, but there are ${rec.timing.samples.length} samples for ${rec.protocol.reps} repetitions`);
      if (rec.validity.reasons.length) err('validity.reasons', 'a valid record has no invalidity reasons');
    } else if (!rec.validity.reasons.length) err('validity.reasons', 'an invalid record must say why');
    if ((rec.timing.kind === 'wall-clock' || legacy) && !rec.validity.partial.length) err('validity.partial', `a ${rec.timing.kind} record must state its caveat`);
    if (rec.protocol.position && rec.protocol.position.length !== rec.timing.samples.length) err('protocol.position', 'expected one position per sample');
    let id: string | null = null;
    try { id = recordId(rec); } catch (e) { err('$', (e as Error).message); }
    if (id && rec.id !== id) err('id', `expected ${id} (sha256 of the canonical record without id)`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, record: r as MeasurementRecord, errors: [] };
}

/**
 * May this record decide a schedule? Only a valid, complete (no partial caveats), non-legacy record whose
 * content id matches the kernel as it is now. A record with a different content id is stale (guide §27).
 */
export function isDecisive(record: MeasurementRecord, currentContentId: string): boolean {
  return record.validity.ok && !record.validity.partial.length && record.timing.kind !== 'legacy' && record.kernel.contentId === currentContentId;
}
