// The page's side of the Kiln server (guide §30.3), without React or the workbench: keeping the EvidenceStore and the
// server's records in step, the CUDA devices the server's executors reach, and the job list the Jobs view draws.
// wb.js wires these to the server-client and to its channels; test/server-sync.mjs drives them with a fake client.
import { EVIDENCE_FORMAT } from "@kiln/kiln/std/store.js";
import { cudaTarget } from "@kiln/kiln/std/devices.js";
import { SPECS, target } from "@kiln/kiln/std/targets.js";

/**
 * Keep `store` and the server's records in step. The server is the durable copy; the page holds one too.
 *   - load(filter) imports the server's records; they are marked as the server's and never posted back.
 *   - Every store change schedules a push (debounced by `delay` ms) of the records the server does not have yet:
 *     what the page measured, tuned, compared or imported. Posts go in chunks of `chunk` records.
 *   - A record the server rejects is remembered and not posted again; onRejected([{ id, reason }]) hears of it once.
 *   - added({ job, device, ids }) handles a records.added event: records the page lacks are fetched by job, else
 *     by device, else all of them.
 *   - A failed post (the server is gone) is reported to onError and retried at the next change.
 * `store` needs records (a Map), import(json) and on(fn); `client` is connectServer()'s.
 */
export function recordSync({ client, store, delay = 400, chunk = 250, onRejected = () => {}, onError = () => {} }) {
  const synced = new Set(); // ids the server holds
  const refused = new Map(); // id → the server's reason
  let timer = null, pushing = null, again = false;

  const pending = () => [...store.records.values()].filter((r) => !synced.has(r.id) && !refused.has(r.id));

  async function load(filter = {}) {
    const records = await client.records.list(filter);
    for (const r of records) synced.add(r.id);
    const fresh = records.filter((r) => !store.records.has(r.id));
    return fresh.length ? store.import({ format: EVIDENCE_FORMAT, records: fresh }) : { added: 0, skipped: 0, errors: [] };
  }

  async function added({ job = null, device = null, ids = [] } = {}) {
    for (const id of ids) synced.add(id);
    if (ids.every((id) => store.records.has(id))) return { added: 0, skipped: 0, errors: [] };
    return load(job ? { job } : device ? { device } : {});
  }

  async function push() {
    const batch = pending();
    const out = { added: 0, duplicates: 0, rejected: [] };
    for (let i = 0; i < batch.length; i += chunk) {
      const part = batch.slice(i, i + chunk);
      const res = await client.records.add(part);
      const bad = new Map((res.rejected || []).map((x) => [x.id, x.reason]));
      for (const r of part) if (bad.has(r.id)) refused.set(r.id, bad.get(r.id)); else synced.add(r.id);
      out.added += res.added || 0; out.duplicates += res.duplicates || 0; out.rejected.push(...(res.rejected || []));
    }
    if (out.rejected.length) onRejected(out.rejected);
    return out;
  }

  /** Post what is pending now. Concurrent calls share one post, and a change during a post schedules another. */
  function flush() {
    clearTimeout(timer); timer = null;
    if (pushing) { again = true; return pushing; }
    if (!pending().length) return Promise.resolve(null);
    pushing = push()
      .catch((e) => { onError(e); return null; })
      .finally(() => { pushing = null; if (again) { again = false; schedule(); } });
    return pushing;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, delay); }

  /** Forget devices on the server too: their records and their rows. → the number of records deleted there. */
  async function forget(devices) {
    let n = 0;
    for (const d of new Set(devices)) n += await client.records.forget(d);
    return n;
  }

  const off = store.on(schedule);
  return { load, added, flush, schedule, forget, pending, synced, refused, stop: () => { off(); clearTimeout(timer); } };
}

/**
 * A CUDA device that a server executor reaches. Measure on it proposes a job (wb.js); its identity is the one the
 * server reports for the executor's device (GET /devices), so its records and the page's decisions use one id.
 */
export class ServerDevice {
  constructor(executor, client, protocol = null) {
    this.id = `server:${executor}`; this.kind = "cuda"; this.server = true; this.executor = executor; this.client = client;
    this.name = `CUDA ${executor}`; this.label = `CUDA · ${executor} · server`; this.status = "not probed yet";
    this.target = target(SPECS.rtx5090); this.info = null; this.fingerprint = null; this.evidenceId = null; this.view = null;
    // the job protocol (guide §28), as jobSpec's defaults; the Devices view edits it
    this.protocol = { reps: 7, warmup: 3, launches: 20, seed: 1, ...protocol };
  }
  /** Take the server's view of this executor's device (GET /devices, a probe). */
  adopt(view) {
    if (!view) return;
    this.view = view;
    this.evidenceId = view.id ?? null;
    this.fingerprint = view.fingerprint ?? null;
    this.info = view.fingerprint ?? null;
    if (view.id) this.name = view.name;
    this.label = `${view.id ? view.name : "CUDA"} · ${this.executor} · server`;
    this.status = view.available ? "ready" : `not connected: ${view.error || "the executor has not reached its device"}`;
    if (this.info) this.target = cudaTarget(this.info, this.name);
  }
  /** Ask the server to probe the executor (the runner's device report). */
  async probe() {
    try { this.adopt(await this.client.devices.probe(this.executor)); }
    catch (e) { this.status = `not connected: ${e.message || e}`; }
    return this.status === "ready";
  }
  // Tune and Compare run on the page's devices; a server executor runs jobs, which Measure proposes
  async runKernels() { throw new Error(`${this.label} runs jobs only: Measure proposes one (Tune and Compare run on the page's devices)`); }
  async runKernel() { return this.runKernels(); }
  describe() {
    return { kind: "CUDA through the Kiln server", executor: this.executor, ...(this.info || {}), status: this.status, note: "Measure proposes a job on this executor and opens the Jobs view; the job's records arrive when it finishes, and the next compile decides with them." };
  }
}

/**
 * The server devices for a GET /devices list: one per executor, in executor order. A device already made for an
 * executor is kept (the selection holds on to it) and adopts the new view.
 */
export function serverDevices(views, existing, client, protocol = null) {
  const old = new Map(existing.map((d) => [d.executor, d]));
  return views.filter((v) => v.executor).sort((a, b) => a.executor.localeCompare(b.executor)).map((v) => {
    const d = old.get(v.executor) ?? new ServerDevice(v.executor, client, protocol);
    d.adopt(v);
    return d;
  });
}

/** The job list with one job's new view in place, newest first (job.updated carries no events: keep the old ones). */
export function upsertJob(jobs, view) {
  if (!view?.id) return jobs;
  const old = jobs.find((j) => j.id === view.id);
  const next = { ...old, ...view, events: view.events ?? old?.events };
  return [next, ...jobs.filter((j) => j.id !== view.id)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/**
 * A job.event: appended to the job's events when the page holds them (a full view was read), else ignored. A full
 * view and the event stream can both carry an event (a view read while the job runs), so an event already there,
 * the same instant, kind and text, is not added twice.
 */
export function addJobEvent(jobs, e) {
  const j = jobs.find((x) => x.id === e?.job);
  if (!j?.events || j.events.some((x) => x.at === e.at && x.kind === e.kind && x.detail === e.detail)) return jobs;
  return jobs.map((x) => (x === j ? { ...j, events: [...j.events, { at: e.at, kind: e.kind, detail: e.detail }] } : x));
}
