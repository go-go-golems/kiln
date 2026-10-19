// The evidence store: measured rows keyed by (device, kernel identity), keep-best per knob row.
// A greedy compile asks it first at every schedule fork (k.decide.evidence), before the cost model.
import { knobs as KN } from "../core/kiln.js";

export class Store {
  constructor(rows = []) { this.rows = new Map(); this.subs = new Set(); for (const r of rows) this.put(r, false); }
  key(device, identity) { return device + "|" + identity; }
  put(r, notify = true) {
    const k = this.key(r.device, r.identity);
    const list = this.rows.get(k) || [];
    const c = KN.canonical(r.knobs);
    const i = list.findIndex((x) => KN.canonical(x.knobs) === c);
    if (i >= 0) { if (!(r.us < list[i].us) && list[i].ok !== false) return list[i]; list[i] = r; } else list.push(r);
    this.rows.set(k, list);
    if (notify) this.emit();
    return r;
  }
  record({ device, kern, result, by = "measure" }) {
    if (!result || result.error || !isFinite(result.us)) return null;
    return this.put({ device, identity: kern.identity, name: kern.name, knobs: { ...kern.map }, row: kern.row, us: result.us, ok: result.check?.ok !== false, by, t: Date.now(), metrics: slim(result.metrics) });
  }
  lookup(fp, run) {
    const dev = run?.ctx?.deviceId;
    if (!dev) return null;
    return (this.rows.get(this.key(dev, fp.key)) || []).filter((r) => r.ok !== false);
  }
  best(device, identity) { const l = (this.rows.get(this.key(device, identity)) || []).filter((r) => r.ok !== false); return l.length ? l.reduce((a, b) => (b.us < a.us ? b : a)) : null; }
  list(filter = {}) {
    const out = [];
    for (const list of this.rows.values()) for (const r of list) if ((!filter.device || r.device === filter.device) && (!filter.identity || r.identity === filter.identity) && (!filter.name || r.name === filter.name)) out.push(r);
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.us - b.us));
  }
  get size() { let n = 0; for (const l of this.rows.values()) n += l.length; return n; }
  clear(filter = {}) { if (!Object.keys(filter).length) this.rows.clear(); else for (const r of this.list(filter)) { const k = this.key(r.device, r.identity); this.rows.set(k, (this.rows.get(k) || []).filter((x) => x !== r)); } this.emit(); }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { for (const f of this.subs) f(); }
  toJSON() { return { format: "kiln-evidence/1", rows: this.list() }; }
  import(json) { const rows = (json?.rows || []).filter((r) => r.device && r.identity && r.knobs && isFinite(r.us)); for (const r of rows) this.put(r, false); this.emit(); return rows.length; }
}
const slim = (m) => (m ? Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "number" || typeof v === "string")) : null);
