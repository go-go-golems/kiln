// The evidence store: kiln-measure/1 records, keyed by their content-hash id (guide §21). A greedy compile asks it
// at every schedule fork (k.decide.evidence) for per-option statistics over the records that may decide:
// valid, complete (no partial caveat), not legacy, and fresh — their content id is the option's current one (§27).
//
// "Current" content id of an option (device, kernel identity, row): the one observed when the workbench last
// compiled that kernel (observe), else the one in the option's newest record. A fork's other options have not been
// compiled, so their content id cannot be known before measuring; the newest record stands in for it, and a record
// from an older code generator (manifest.codegen) is stale regardless.
import { isDecisive, summarize, validateRecord } from "@kiln/evidence";
import { knobs as KN } from "../core/kiln.js";
import { CODEGEN_VERSION, contentOf, legacyRecord, makeRecord } from "./records.js";
import { canonRow } from "./tile.js";

export const EVIDENCE_FORMAT = "kiln-evidence/2";
const optKey = (device, identity, row) => `${device}|${identity}|${row}`;

export class EvidenceStore {
  constructor(records = []) {
    this.records = new Map(); // id → record
    this.current = new Map(); // optKey → { contentId, at, observed }
    this.subs = new Set();
    for (const r of records) this.add(r, false);
  }

  /** Validate and store one record; the same id is stored once. Throws TypeError listing the problems. */
  add(record, notify = true) {
    const v = validateRecord(record);
    if (!v.ok) throw new TypeError(`not a kiln-measure/1 record: ${v.errors.slice(0, 3).join("; ")}`);
    const had = this.records.get(record.id);
    if (had) return had;
    this.records.set(record.id, record);
    const k = record.kernel;
    if (k.contentId) {
      const key = optKey(record.device.id, k.identity, k.row), cur = this.current.get(key);
      if (!cur || (!cur.observed && cur.at <= record.at)) this.current.set(key, { contentId: k.contentId, at: record.at, observed: false });
    }
    if (notify) this.emit();
    return record;
  }

  /** Build a record from a device's result and store it (measure, tune and import all come through here). */
  record({ device, kern, result, by = "measure", activation = null, pairId = null, context = null }) {
    return this.add(makeRecord({ device, kern, result, by, activation, pairId, context }));
  }

  /** Note the content ids of a freshly compiled program on `device`: these are now the current ones. */
  observe(prog, device) {
    if (!prog || !device?.evidenceId) return;
    let changed = false;
    for (const kern of prog.kernels) {
      const { contentId } = contentOf(kern, device);
      const key = optKey(device.evidenceId, kern.identity, kern.row), cur = this.current.get(key);
      if (cur?.contentId !== contentId || !cur.observed) { this.current.set(key, { contentId, at: new Date().toISOString(), observed: true }); changed ||= cur?.contentId !== contentId; }
    }
    if (changed) this.emit();
  }

  /** How a schedule is named in notes and tables: "MAP=tiled,BM=32,BN=16,BK=8". */
  rowOf(knobs) { return canonRow(knobs); }

  /** The content id an option's records are compared against, or null when nothing is known. */
  currentContentId(device, identity, row) { return this.current.get(optKey(device, identity, row))?.contentId ?? null; }

  /** A record whose code is not what this option compiles to now (different content id, or an older code generator). */
  isStale(r) {
    if (r.timing.kind === "legacy") return false;
    if (r.manifest.codegen !== CODEGEN_VERSION) return true;
    const cur = this.currentContentId(r.device.id, r.kernel.identity, r.kernel.row);
    return cur !== null && cur !== r.kernel.contentId;
  }

  /** May this record decide a schedule or support a hypothesis? */
  isDecisive(r) {
    const cur = this.currentContentId(r.device.id, r.kernel.identity, r.kernel.row) ?? r.kernel.contentId;
    return r.manifest.codegen === CODEGEN_VERSION && isDecisive(r, cur);
  }

  /** Status word for a record: invalid, stale, partial (legacy included) or fresh. */
  status(r) { return !r.validity.ok ? "invalid" : this.isStale(r) ? "stale" : r.validity.partial.length ? "partial" : "fresh"; }

  /**
   * Statistics of one option (device, kernel identity, knobs) over its decisive records, with their samples
   * pooled: `{ median, lo, hi, n, note, deterministic, records }`, or null when no record may decide. A
   * simulator's records are deterministic: one sample, a zero-width interval.
   */
  statsFor(device, identity, knobs) {
    const want = KN.canonical(knobs);
    const recs = [];
    for (const r of this.records.values()) if (r.device.id === device && r.kernel.identity === identity && KN.canonical(r.kernel.knobs) === want && this.isDecisive(r)) recs.push(r);
    if (!recs.length) return null;
    const s = summarize(recs.flatMap((r) => r.timing.samples));
    if (s.median === null) return null;
    return { median: s.median, lo: s.ci[0], hi: s.ci[1], n: s.n, note: s.note, deterministic: recs.every((r) => r.timing.kind === "simulated"), records: recs };
  }

  /** Per option of a fork point, aligned with fp.options (k.decide.evidence). */
  optionStats(fp, run) {
    const dev = run?.ctx?.deviceId;
    if (!dev) return fp.options.map(() => null);
    return fp.options.map((o) => this.statsFor(dev, fp.key, o.knobs));
  }

  /** Records, newest first within a kernel name. Filter by device id, kernel identity, kernel name or status. */
  list(filter = {}) {
    const out = [];
    for (const r of this.records.values()) {
      if (filter.device && r.device.id !== filter.device) continue;
      if (filter.identity && r.kernel.identity !== filter.identity) continue;
      if (filter.name && r.kernel.name !== filter.name) continue;
      if (filter.status && this.status(r) !== filter.status) continue;
      out.push(r);
    }
    return out.sort((a, b) => (a.kernel.name < b.kernel.name ? -1 : a.kernel.name > b.kernel.name ? 1 : a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }

  /** The decisive option with the lowest median for (device, identity): `{ row, knobs, median, lo, hi, n, … }`. */
  best(device, identity) {
    const seen = new Map();
    for (const r of this.records.values()) if (r.device.id === device && r.kernel.identity === identity && this.isDecisive(r)) seen.set(KN.canonical(r.kernel.knobs), r);
    let best = null;
    for (const r of seen.values()) { const s = this.statsFor(device, identity, r.kernel.knobs); if (s && (!best || s.median < best.median)) best = { row: r.kernel.row, knobs: r.kernel.knobs, ...s }; }
    return best;
  }

  get size() { return this.records.size; }

  /** Remove the records matching the filter (all of them with no filter). */
  forget(filter = {}) {
    if (!Object.keys(filter).length) { this.records.clear(); this.current.clear(); }
    else for (const r of this.list(filter)) this.records.delete(r.id);
    this.emit();
  }
  clear(filter = {}) { this.forget(filter); }

  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { for (const f of this.subs) f(); }

  toJSON() { return { format: EVIDENCE_FORMAT, records: [...this.records.values()] }; }

  /**
   * One device's records and current content ids as plain data, and back: a store rebuilt from the slice decides
   * that device's forks as this one does (the agent's sandbox frame compiles with it).
   */
  slice(device) { return { records: this.list({ device }), current: [...this.current].filter(([key]) => key.startsWith(device + "|")) }; }
  static fromSlice({ records = [], current = [] }) {
    const s = new EvidenceStore(records);
    for (const [key, v] of current) s.current.set(key, v);
    return s;
  }

  /**
   * Import a kiln-evidence/2 export (each record validated, its id recomputed rather than trusted) or a
   * kiln-evidence/1 export (rows become legacy records). Returns `{ added, skipped, errors }`.
   */
  import(json) {
    const out = { added: 0, skipped: 0, errors: [] };
    const before = this.size;
    const keep = (e) => { out.skipped++; if (out.errors.length < 5) out.errors.push(e.message); };
    if (json?.format === EVIDENCE_FORMAT) {
      for (const r of json.records || []) { try { this.add(r, false); } catch (e) { keep(e); } }
    } else if (json?.format === "kiln-evidence/1" || Array.isArray(json?.rows)) {
      for (const row of json.rows || []) {
        if (!(row?.device && row.identity && row.knobs && Number.isFinite(row.us))) { out.skipped++; continue; }
        try { this.add(legacyRecord(row), false); } catch (e) { keep(e); }
      }
    } else throw new TypeError(`not an evidence export: expected format ${EVIDENCE_FORMAT} or kiln-evidence/1`);
    out.added = this.size - before;
    this.emit();
    return out;
  }
}

// scripts and older code construct `new std.Store()`
export { EvidenceStore as Store };
