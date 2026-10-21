// The open lab program (guide §33): its source, its build (registry and IR, from @kiln/lab), the applied parameter
// values and board signals, the selection, and the data it reads. With a Kiln server the data is what
// `lab:import` brought into it, read through /api/lab/*; without one, and for every capture the server does not
// hold, the program runs on @kiln/lab's synthetic source, and every board says which of the two it shows. The hosts a
// program may name are the server's (GET /api/hosts, one capability report per probed host) and the synthetic ones;
// a capture on a real host is never seeded, so it is cached only once a job measured it. Running the plan submits the
// missing captures as jobs; their runs arrive by catalog.changed and the program rebuilds with them.
// Views subscribe to the workbench's "lab" channel.
import { wb, lsGet, lsSet } from "../wb.js";
import * as Dock from "../dock.js";
import { LAB_PROGRAMS } from "../../labs.gen.js";
import { build, BuildError, checkParam, dehydrate, isParamRef, isSignalRef, syntheticEnv, serverEnv, labClient, labJobs } from "./api.js";

const bump = () => wb.bump("lab");

class Labs {
  constructor() {
    this.programs = LAB_PROGRAMS;
    this.current = null;
    this.client = wb.server ? labClient(wb.server) : null;
    this.catalog = {}; this.seeds = {}; this.reports = {};
    this.serverState = this.client ? "unknown" : "none";
    /** job id → the refs it runs, for the jobs this page submitted from a plan */
    this.jobs = new Map();
    wb.on("hosts", () => this.hostsChanged());
    wb.on("catalog", () => void this.catalogChanged());
  }

  /** Open program `id` and build it; with a server, its imported data first. */
  async open(id) {
    const p = this.programs.find((x) => x.id === id);
    if (!p) return wb.toast(`No lab program ${id}`, "bad");
    // a board belongs to its program: the previous program's board views close with it
    if (this.current && this.current.id !== id) {
      const layout = Dock.openViews(wb.layout).filter(Dock.isBoardView).reduce((l, v) => Dock.closeView(l, v), wb.layout);
      if (layout !== wb.layout) wb.setLayout(layout);
    }
    lsSet("lab", id);
    this.current = { id, title: p.name, short: p.name.split(" · ")[0], source: p.source, values: {}, applied: {}, signals: {}, pending: null, selected: null, reg: null, ir: null, state: { params: {}, signals: {} }, error: null };
    bump();
    if (this.client) await this.refresh();
    this.rebuild("open");
    await this.loadMeasured();
  }

  /** The server's catalog, archives and datasets; a failure leaves the program on synthetic data and says so. */
  async refresh() {
    try { this.catalog = await this.client.catalog(); await this.client.loadEvidence(); this.reports = this.client.setHosts(wb.hosts, wb.workloads); this.serverState = "online"; }
    catch (e) { this.serverState = "offline"; this.catalog = {}; wb.log("warn", `lab data: the server did not answer (${e.message}); lab programs run on synthetic data`); }
  }

  rebuild(reason = "build", params = null) {
    const cur = this.current;
    if (!cur) return null;
    try {
      // a capture of the default parameters exists as a synthetic artifact unless a real host measures it
      const seedKey = `${cur.id}|${Object.keys(this.reports).sort().join(",")}`;
      if (!this.seeds[seedKey]) {
        const s = build({ source: cur.source, labId: cur.id, params: {}, env: syntheticEnv(new Set(), { hosts: this.reports }), seedMode: true });
        this.seeds[seedKey] = Object.fromEntries(s.ir.plan.captures.filter((c) => !(c.host in this.reports)).map((c) => [c.hash, { origin: "seed", at: 0 }]));
      }
      cur.seedKey = seedKey;
      const out = build({ source: cur.source, labId: cur.id, params: params ?? cur.applied, env: this.env(), patches: [] });
      if (params) return out;
      Object.assign(cur, { reg: out.registry, ir: out.ir, error: null });
      cur.state = { params: cur.applied, signals: cur.signals };
      const errors = out.ir.lint.filter((l) => l.level === "error");
      wb.log(errors.length ? "warn" : "ok", `lab ${reason}: ${out.ir.title} in ${out.ir.durationMs} ms · ${out.ir.boards.length} boards · ${errors.length} lint errors`);
      for (const l of errors) wb.log("warn", `${l.code}: ${l.message}`);
      bump();
      return out;
    } catch (e) {
      if (params) throw e;
      cur.error = e instanceof BuildError ? `${e.failure?.phase ?? "build"}: ${e.failure?.message ?? e.message}` : String(e?.message ?? e);
      wb.log("error", `lab ${cur.id}: ${cur.error}`);
      bump();
      return null;
    }
  }

  env() {
    const catalog = { ...this.seeds[this.current.seedKey], ...this.catalog };
    return this.client && this.serverState === "online" ? serverEnv(catalog, this.client) : syntheticEnv(new Set(Object.keys(catalog)));
  }

  /** Fetch the runs of every measured capture the build refers to, then rebuild with them. */
  async loadMeasured() {
    const cur = this.current;
    if (!cur?.ir || !this.client || this.serverState !== "online") return;
    const need = cur.ir.plan.captures.map((c) => c.hash).filter((h) => this.catalog[h]?.origin === "measured" && !this.client.bundlesLoaded(h));
    if (!need.length) return;
    try { const n = await this.client.loadBundles(need); if (n && this.current === cur) this.rebuild(`${n} measured capture${n > 1 ? "s" : ""} loaded`); }
    catch (e) { wb.log("error", `lab: could not load measured runs: ${e.message}`); wb.toast(`Could not load the measured runs: ${e.message}`, "bad"); }
  }

  /** A declared parameter: view- and data-bound values apply at once; a plan-bound value applies only if its captures exist. */
  setParam(key, value) {
    const cur = this.current, p = cur?.reg?.params.get(key);
    if (!p) return;
    const check = checkParam(p.slot.spec, value, p.summary.options);
    if (!check.ok) return wb.toast(`${p.slot.urlKey}: ${check.error}`, "bad");
    cur.values = { ...cur.values, [key]: value };
    if (p.summary.binding !== "plan") { cur.applied = { ...cur.applied, [key]: value }; cur.state = { params: cur.applied, signals: cur.signals }; return bump(); }
    const desired = { ...cur.applied, [key]: value };
    let out;
    try { out = this.rebuild("plan change", desired); } catch (e) { return wb.toast(`Could not build with ${p.slot.urlKey}=${JSON.stringify(value)}: ${e.message}`, "bad"); }
    const missing = out.ir.plan.captures.filter((c) => c.status !== "cached");
    if (!missing.length) { cur.applied = desired; cur.pending = null; this.rebuild(`applied ${p.slot.urlKey}=${JSON.stringify(value)}`); void this.loadMeasured(); return; }
    const from = key in cur.applied ? cur.applied[key] : p.summary.defaultValue;
    cur.pending = { changes: [{ key, urlKey: p.slot.urlKey, from, to: value }], captures: missing, desired };
    wb.log("warn", `lab: pending plan ${p.slot.urlKey} ${JSON.stringify(from)} → ${JSON.stringify(value)} · ${missing.length} captures not imported`);
    bump();
  }

  revertPlan() {
    const cur = this.current;
    if (!cur?.pending) return;
    const values = { ...cur.values };
    for (const c of cur.pending.changes) { if (c.key in cur.applied) values[c.key] = cur.applied[c.key]; else delete values[c.key]; }
    Object.assign(cur, { values, pending: null });
    bump();
  }

  /** A board signal or parameter, written by a control or a handler. */
  setRef(ref, value) {
    const cur = this.current;
    if (!cur) return;
    if (isSignalRef(ref)) { cur.signals = { ...cur.signals, [ref.key]: dehydrate(value) }; cur.state = { params: cur.applied, signals: cur.signals }; bump(); }
    else if (isParamRef(ref)) this.setParam(ref.key, value);
  }

  select(ref) { if (this.current) { this.current.selected = ref; bump(); } }

  /** The server's hosts changed (probed, or read for the first time): rebuild if the reports a program sees changed. */
  hostsChanged() {
    if (!this.client || this.serverState !== "online") return;
    const before = JSON.stringify(this.reports);
    this.reports = this.client.setHosts(wb.hosts, wb.workloads);
    if (this.current && JSON.stringify(this.reports) !== before) { this.rebuild("hosts changed"); void this.loadMeasured(); }
  }

  /** A job imported runs: read the catalog again, apply a pending plan whose captures all exist now, and rebuild. */
  async catalogChanged() {
    const cur = this.current;
    if (!cur || !this.client || this.serverState !== "online") return;
    try { this.catalog = await this.client.catalog(); }
    catch (e) { return wb.log("warn", `lab: reading the catalog failed: ${e.message}`); }
    if (this.current !== cur) return;
    if (cur.pending && cur.pending.captures.every((c) => this.catalog[c.hash])) {
      wb.log("ok", `lab: the pending plan's ${cur.pending.captures.length} captures exist; applying ${cur.pending.changes.map((c) => `${c.urlKey}=${JSON.stringify(c.to)}`).join(", ")}`);
      Object.assign(cur, { applied: cur.pending.desired, pending: null });
    }
    this.rebuild("catalog changed");
    await this.loadMeasured();
  }

  /** The captures a plan still needs: the build's own, or the pending plan's. */
  missing() {
    const cur = this.current;
    return cur?.pending ? cur.pending.captures : (cur?.ir?.plan.captures ?? []).filter((c) => c.status === "execute");
  }

  /**
   * Run captures on the hosts they name (default: what the plan is missing), as approved jobs; with { dryRun } the
   * server answers the plans and verdicts and nothing is stored. → the created jobs (or dry-run answers).
   */
  async runPlan(captures = this.missing(), { dryRun = false } = {}) {
    const cur = this.current;
    if (!cur || !wb.server) return [];
    const { jobs, skipped } = labJobs(cur.id, captures, { dryRun });
    for (const s of skipped) wb.log("warn", `lab: ${s.ref} cannot run on a Kiln host: ${s.why}`);
    if (!jobs.length) { wb.toast(skipped.length ? `None of these captures can run on a Kiln host (${skipped[0].why})` : "Nothing to run", "bad"); return []; }
    const out = [];
    for (const spec of jobs) {
      try {
        const job = await wb.server.jobs.create(spec);
        out.push(job);
        if (dryRun) continue;
        this.jobs.set(job.id, spec.captures.map((c) => c.input.ref));
        wb.proposed.add(job.id);
        wb.log("measure", `lab ${cur.id}: job ${job.id.slice(4, 12)} on ${spec.host}, ${spec.captures.length} captures × ${spec.protocol.reps} processes`);
      } catch (e) {
        wb.toast(`${spec.host} did not take the job: ${e.message}`, "bad");
        wb.log("measure", `lab ${cur.id}: job on ${spec.host} refused: ${e.message}`, { bad: true });
      }
    }
    if (dryRun) { cur.dryRun = { at: new Date().toISOString(), results: out }; bump(); return out; }
    if (out.length) { wb.toast(`${out.length} job${out.length === 1 ? "" : "s"} submitted: ${out.reduce((n, j) => n + j.captures.length, 0)} captures. The boards rebuild when their runs arrive.`); wb.bump("jobs"); }
    bump();
    return out;
  }

  hypotheses() { return this.current?.reg ? [...this.current.reg.hypotheses.keys()] : []; }

  /** Where the open program's data comes from, in words. */
  dataLine() {
    if (!this.current) return "";
    if (this.serverState === "none") return "no Kiln server: synthetic data only";
    if (this.serverState === "offline") return "the Kiln server did not answer: synthetic data only";
    const n = Object.values(this.catalog).filter((c) => c.origin === "measured").length;
    return `${n} measured capture${n === 1 ? "" : "s"} on the Kiln server`;
  }

  badge() { return this.current?.error ? ["!", true] : null; }

  /** Reopen the program open last, once the page is up. */
  restore() { const id = lsGet("lab", null); if (id && this.programs.some((p) => p.id === id)) void this.open(id); }
}

export const labs = new Labs();
