// The workbench: owns the script, the compiled run, devices, measurements, the evidence store and
// tuning. React views subscribe to named channels (the Octavo Lab pattern).
import { k, ParamSet } from "@kiln/kiln/core/kiln.js";
import { runScript, headerOf, lineOf } from "@kiln/kiln/core/script.js";
import { std } from "@kiln/kiln/std/index.js";
import { programOf } from "@kiln/kiln/std/program.js";
import { makeDevices, bundle as makeBundle, ingest } from "@kiln/kiln/std/devices.js";
import { EvidenceStore } from "@kiln/kiln/std/store.js";
import { activationOf } from "@kiln/kiln/std/records.js";
import { tune as runTune, measureProgram, measurePaired, kernelPinPolicy } from "@kiln/kiln/std/tune.js";
import { schedule } from "@kiln/kiln/std/loop.js";
import { canonRow } from "@kiln/kiln/std/tile.js";
import { Tensor, compare, fmtUs, clip } from "@kiln/kiln/core/util.js";
import { PRESETS } from "../presets.gen.js";
import { REFERENCE, GUIDELINES, RUNNER } from "../docs.gen.js";
import * as Dock from "./dock.js";
import { median } from "@kiln/kiln/core/util.js";
import { connectServer, jobSpec } from "../server-client.js";
import { recordSync, serverDevices, upsertJob, addJobEvent } from "../server-sync.js";

const LS = "kiln-wb:";
export const lsGet = (key, d) => { try { const v = localStorage.getItem(LS + key); return v == null ? d : JSON.parse(v); } catch { return d; } };
export const lsSet = (key, v) => { try { localStorage.setItem(LS + key, JSON.stringify(v)); } catch {} };
export const GROUP_ORDER = ["Basics", "GPU optimization", "ML compiler", "Write programs", "Extend the compiler", "Other compilers", "Mine"];

class Workbench {
  constructor() {
    this.ver = {}; this.subs = new Map();
    this.builtins = PRESETS.map((p) => ({ ...p, builtin: true }));
    this.mine = lsGet("mine", []);
    this.preset = null; this.script = ""; this.savedScript = ""; this.diags = []; this.notes = ""; this.savedNotes = "";
    this.project = null; this.graph = null; this.run = null; this.prog = null; this.compileMs = 0; this.e2e = null; this.outputs = null;
    this.params = new ParamSet([]); this.kernelPins = {};
    this.devices = makeDevices();
    // the measurement protocol a device runs (reps, warm-up, launches, seed), as last set in Devices
    for (const d of this.devices) { const p = d.protocol && lsGet("protocol:" + d.kind, null); if (p) Object.assign(d.protocol, p); }
    this.deviceId = lsGet("device", "sim:rtx5090");
    this.store = new EvidenceStore();
    // kiln-evidence/2 records; a kiln-evidence/1 store from before becomes legacy records once
    try { const saved = lsGet("evidence2", null); if (saved) this.store.import(saved); else { const old = lsGet("evidence", null); if (old?.rows?.length) this.store.import(old); } } catch {}
    this.store.on(() => { clearTimeout(this._st); this._st = setTimeout(() => lsSet("evidence2", this.store.toJSON()), 400); this.bump("store"); });
    // the Kiln server that served this page, if one did (guide §30); see the server section
    this.server = connectServer(); this.serverInfo = { state: this.server ? "connecting" : "none" }; this.jobs = []; this.awaiting = new Map(); this.proposed = new Set();
    this.measures = {}; this.history = []; this.measuring = false;
    this.tuning = null;
    this.events = [];
    this.sel = { ir: null, node: null, step: null, kernel: null, decision: null, record: null, src: "cuda" };
    this.ui = { theme: lsGet("theme", "auto") };
    this.layout = (() => { try { const l = lsGet("layout", null); return l ? Dock.normalize(l) : Dock.defaultLayout(); } catch { return Dock.defaultLayout(); } })();
    // layouts saved before the Notes view existed: put Notes beside Code
    if (!Dock.openViews(this.layout).includes("notes")) { const t = Dock.tileOf(this.layout, "code") || Dock.tiles(this.layout)[0]; if (t) this.layout = Dock.normalize(Dock.moveToTab(this.layout, "notes", t.id, 0)); }
    // layouts saved before the Evidence view existed: put Evidence beside Tune, once (closing it later sticks)
    if (!lsGet("evidenceView", false)) {
      lsSet("evidenceView", true);
      const t = !Dock.openViews(this.layout).includes("evidence") && (Dock.tileOf(this.layout, "tune") || Dock.tileOf(this.layout, "perf"));
      if (t) this.layout = Dock.normalize(Dock.moveToTab(this.layout, "evidence", t.id, t.views.indexOf("tune") + 1 || null));
    }
    // layouts saved before the Hypotheses view existed: put Hypotheses beside Evidence, once
    // layouts saved before the Jobs view existed: put Jobs beside Devices, once
    if (!lsGet("jobsView", false)) {
      lsSet("jobsView", true);
      const t = !Dock.openViews(this.layout).includes("jobs") && Dock.tileOf(this.layout, "devices");
      if (t) this.layout = Dock.normalize(Dock.moveToTab(this.layout, "jobs", t.id, t.views.indexOf("devices") + 1));
    }
    if (!lsGet("hypothesesView", false)) {
      lsSet("hypothesesView", true);
      const t = !Dock.openViews(this.layout).includes("hypotheses") && Dock.tileOf(this.layout, "evidence");
      if (t) this.layout = Dock.normalize(Dock.moveToTab(this.layout, "hypotheses", t.id, t.views.indexOf("evidence") + 1));
    }
    this.maxTile = null; this.focusTile = null; this.phoneView = "ir"; this.drag = null;
    this.toasts = []; this.sample = null; this.platformReady = false; this.ready = false; this.error = null;
  }
  // ---------- channels ----------
  on(ch, fn) { if (!this.subs.has(ch)) this.subs.set(ch, new Set()); this.subs.get(ch).add(fn); return () => this.subs.get(ch).delete(fn); }
  bump(...chs) { for (const c of chs) { this.ver[c] = (this.ver[c] || 0) + 1; for (const f of this.subs.get(c) || []) f(); } }
  version(ch) { return this.ver[ch] || 0; }
  toast(text, tone = "") { const id = Math.random(); this.toasts.push({ id, text, tone }); this.bump("toast"); setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); this.bump("toast"); }, 3400); }
  log(kind, text, extra = {}) { this.events.push({ t: Date.now(), kind, text, ...extra }); if (this.events.length > 600) this.events.splice(0, 100); this.bump("events"); }
  setUI(patch) { const { view, ...rest } = patch; Object.assign(this.ui, rest); if ("theme" in patch) lsSet("theme", this.ui.theme); if (view) this.showView(view); this.bump("ui"); }
  select(patch) { Object.assign(this.sel, patch); this.bump("sel"); }

  // ---------- layout (dock.js) ----------
  setLayout(root, { save = true } = {}) { this.layout = Dock.normalize(root); if (this.maxTile && !Dock.findNode(this.layout, this.maxTile)) this.maxTile = null; if (save) lsSet("layout", this.layout); this.bump("layout"); }
  noteActive(v) { this.phoneView = v; }
  showView(v) { if (!Dock.ALL_VIEWS.includes(v)) return; const next = Dock.reveal(this.layout, v, this.focusTile); const t = Dock.tileOf(next, v); if (this.maxTile && t && t.id !== this.maxTile) this.maxTile = null; this.noteActive(v); if (next !== this.layout) this.setLayout(next); else this.bump("layout"); }
  activateTab(tileId, v) { this.focusTile = tileId; this.noteActive(v); this.setLayout(Dock.activate(this.layout, tileId, v)); }
  dropView(v, target) { const next = target.kind === "side" ? Dock.moveToSide(this.layout, v, target.tile, target.side) : Dock.moveToTab(this.layout, v, target.tile, target.index ?? null); if (next === this.layout) return; this.noteActive(v); this.setLayout(next); this.focusTile = Dock.tileOf(this.layout, v)?.id || null; }
  closeView(v) { this.setLayout(Dock.closeView(this.layout, v)); }
  splitTile(id, side) { this.maxTile = null; this.setLayout(Dock.splitTile(this.layout, id, side)); }
  closeTile(id) { this.setLayout(Dock.closeTile(this.layout, id)); }
  toggleMax(id) { const t = id || this.focusTile || Dock.tiles(this.layout)[0]?.id; this.maxTile = this.maxTile ? null : t && Dock.findNode(this.layout, t) ? t : null; this.bump("layout"); }
  isVisible(v) { if (this.narrow) return this.phoneView === v; const root = (this.maxTile && Dock.findNode(this.layout, this.maxTile)) || this.layout; return Dock.tiles(root).some((t) => t.active === v); }
  useLayout(id) { const L = Dock.LAYOUTS.find((x) => x.id === id); if (L) { this.maxTile = null; this.setLayout(L.make()); } }

  get presets() { return [...this.builtins, ...this.mine.map((p) => ({ ...p, mine: true }))]; }
  get device() { return this.devices.find((d) => d.id === this.deviceId) || this.devices[0]; }

  // ---------- startup and presets ----------
  async start() {
    const last = lsGet("last", null), draft = lsGet("draft", null), dnotes = lsGet("draftNotes", null);
    const id = last && this.presets.some((p) => p.id === last) ? last : "W-18";
    this.startServer();
    await this.load(id, { draft: draft && draft.id === id ? draft.script : null, draftNotes: dnotes && dnotes.id === id ? dnotes.notes : null });
    this.ready = true;
    this.bump("ready");
    if (this.device.kind !== "sim") this.setDevice(this.device.id, { quiet: true });
  }
  async load(id, { draft = null, draftNotes = null } = {}) {
    const p = this.presets.find((x) => x.id === id);
    if (!p) return this.toast(`No preset ${id}`, "bad");
    this.preset = p; this.script = draft ?? p.text; this.savedScript = p.text;
    this.notes = draftNotes ?? p.notes ?? ""; this.savedNotes = p.notes ?? "";
    this.params = new ParamSet([]); this.kernelPins = {}; this.measures = {}; this.sel = { ...this.sel, node: null, step: null, kernel: null, decision: null, ir: null };
    lsSet("last", id);
    this.bump("preset", "code", "notes");
    this.compile({ fresh: true });
  }
  setNotes(text) {
    this.notes = text;
    lsSet("draftNotes", { id: this.preset?.id, notes: text });
    this.bump("notes");
  }
  setScript(text) {
    this.script = text;
    lsSet("draft", { id: this.preset?.id, script: text });
    clearTimeout(this._ct);
    this._ct = setTimeout(() => this.compile(), 350);
    this.bump("code");
  }

  // ---------- compile ----------
  pipelineFor(project, device = this.device) {
    const base = project?._pipe || std.emmy.pipeline();
    return base.with({ target: device.target, decide: k.decide.chain(kernelPinPolicy(this.kernelPins), base._decide) });
  }
  // compile a script without touching the editor, the run or the views (the agent's editor.check)
  tryCompile(text = this.script, { device = this.device, pins = null } = {}) {
    const res = runScript(text);
    if (!res.ok) return { ok: false, diags: res.diags };
    const project = res.project, pipe = this.pipelineFor(project, device);
    const ps = this.params.clone();
    for (const p of [...project._params, ...pipe.allParams()]) ps.declare(p);
    if (pins) ps.pin(pins);
    let g;
    try { g = project.graph((p) => ps.get(p)); }
    catch (e) { return { ok: false, diags: [...res.diags, { level: "error", line: lineOf(e), message: "tracing the program: " + e.message }] }; }
    const run = pipe.run(g, { params: ps, target: device.target, ctx: { deviceId: device.evidenceId ?? device.id, store: this.store } });
    const prog = run.ok && [...run.graph.nodes.values()].some((n) => n.name === "gpu.kernel") ? programOf(run.graph) : null;
    const diags = [...res.diags, ...(run.ok ? [] : [{ level: "error", line: lineOf(run.error.cause || run.error), message: `${run.error.kind}: ${run.error.message}` }]), ...run.warnings.map((w) => ({ level: "warn", message: w }))];
    return { ok: run.ok, diags, project, graph: g, run, prog, pipe };
  }
  compile({ fresh = false } = {}) {
    const t0 = performance.now();
    const res = runScript(this.script);
    this.diags = res.diags;
    if (!res.ok) { this.bump("diags", "compile"); return false; }
    const project = res.project;
    const firstTime = fresh || this.project?.name !== project.name;
    this.project = project;
    // the script's current definitions win (an edited default or range takes effect); values the user set stay
    for (const p of [...project._params, ...this.pipelineFor(project).allParams()]) this.params.params.set(p.name, p);
    if (firstTime && Object.keys(project._pins).length) this.params.pin(project._pins);
    if (firstTime && project._device && this.devices.some((d) => d.id === project._device) && project._device !== this.deviceId) { this.deviceId = project._device; this.bump("device"); }
    let g;
    try { g = project.graph((p) => this.params.get(p)); }
    catch (e) { this.diags = [...this.diags, { level: "error", line: lineOf(e), message: "tracing the program: " + e.message }]; this.bump("diags", "compile"); return false; }
    this.graph = g;
    const pipe = this.pipelineFor(project);
    const run = pipe.run(g, { params: this.params, target: this.device.target, ctx: { deviceId: this.device.evidenceId ?? this.device.id, store: this.store } });
    this.run = run; this.pipe = pipe;
    this.compileMs = performance.now() - t0;
    this.prog = run.ok && run.graph.nodes.size && [...run.graph.nodes.values()].some((n) => n.name === "gpu.kernel") ? programOf(run.graph) : null;
    // this program's content ids are now the current ones: records of other code for the same rows are stale
    if (this.prog) this.store.observe(this.prog, this.device);
    if (!run.ok) this.diags = [...this.diags, { level: "error", line: lineOf(run.error.cause || run.error), message: `${run.error.kind}: ${run.error.message}` }];
    for (const w of run.warnings) this.diags.push({ level: "warn", message: w });
    if (!this.sel.ir || !run.checkpoints.has(this.sel.ir)) this.sel.ir = run.irOrder.includes("loop") ? "loop" : run.irOrder[run.irOrder.length - 1] || "input";
    if (this.sel.step != null && this.sel.step >= run.steps.length) this.sel.step = null;
    this.checkEndToEnd();
    this.log("compile", `${project.name}: ${run.ok ? "ok" : "failed"} · ${run.steps.filter((s) => s.kind === "rewrite").length} rewrites · ${run.decisions.length} forks · ${this.prog ? this.prog.kernels.length + " kernels" : run.graph.size + " nodes"} · ${run.ms.toFixed(0)} ms`);
    this.bump("compile", "diags", "sel");
    return run.ok;
  }
  // the program's meaning, checked end to end where it is cheap: frontend graph vs the last IR that evaluates
  checkEndToEnd() {
    this.e2e = null; this.outputs = null;
    const run = this.run, g = this.graph, project = this.project;
    if (!run?.ok || !g) return;
    // the same frontend graph and the same final graph mean the same answer: reuse it (measure recompiles)
    const key = `${g.key()}|${run.graph.key()}|${project._checks.length}|${JSON.stringify(project._data ? Object.keys(project._data) : [])}|${this.deviceId}|${this.store.size}|${JSON.stringify(this.params.pinned())}`;
    if (this._e2eKey === key && this._e2eVal && project === this._e2eProject) { this.e2e = this._e2eVal.e2e; this.outputs = this._e2eVal.outputs; return; }
    this._e2eKey = key; this._e2eProject = project;
    try { this.checkEndToEndNow(); } finally { this._e2eVal = { e2e: this.e2e, outputs: this.outputs }; }
  }
  checkEndToEndNow() {
    const run = this.run, g = this.graph, project = this.project;
    try {
      const est = estimateWork(run);
      if (est > 6e7) {
        // too big to evaluate here; structural checks still run (a check that needs outputs is skipped)
        const custom = project._checks.map((c) => { try { return checkResult(c, c.fn({ outputs: null, reference: null, inputs: null, run, graph: g, compare })); } catch (e) { return { name: c.name, ok: true, skipped: true, message: "needs the outputs; skipped at this size" }; } });
        this.e2e = { skipped: `the reference would take ~${(est / 1e6).toFixed(0)}M operations; per-kernel checks still run on every measurement`, custom, ok: custom.every((c) => c.ok) };
        return;
      }
      const inputs = project.inputsFor(g);
      const want = g.eval(inputs);
      const level = ["loop", "gpu", ...[...run.irOrder].reverse()].find((n) => run.at(n) && canEval(run.at(n)));
      const got = level ? run.at(level).eval(inputs) : run.graph.eval(inputs);
      const checks = Object.keys(want).map((name) => ({ name, ...compare(got[name], want[name], { rtol: 1e-3, atol: 1e-4 }) }));
      this.outputs = { inputs, got, want, level };
      const custom = project._checks.map((c) => { try { return checkResult(c, c.fn({ outputs: got, reference: want, inputs, run, graph: g, compare })); } catch (e) { return { name: c.name, ok: false, message: e.message }; } });
      this.e2e = { level, checks, custom, ok: checks.every((c) => c.ok) && custom.every((c) => c.ok) };
    } catch (e) { this.e2e = { error: e.message }; }
  }

  // ---------- params, pins ----------
  pin(obj) { this.params.pin(obj); this.log("pin", Object.entries(obj).map(([a, b]) => `${a}=${b}`).join(", ")); this.compile(); }
  unpin(name) { this.params.unpin(name); this.compile(); }
  setParam(p, v) { this.params.set(p, v); if (p._phase === "run") { this.bump("params"); return; } this.compile(); }
  pinKernel(identity, row) { if (row) this.kernelPins[identity] = row; else delete this.kernelPins[identity]; this.log("pin", row ? `kernel ${clip(identity, 10)} → ${row}` : "kernel pin removed"); this.compile(); }

  // ---------- devices ----------
  /** The id the current device's records carry (fingerprinted; the selection key until a real device is probed). */
  get evidenceId() { return this.device.evidenceId ?? this.device.id; }
  /** Change the measurement protocol of a device (the Devices view); it applies to the next Measure or Tune. */
  setProtocol(device, patch) { Object.assign(device.protocol, patch); lsSet("protocol:" + device.kind, device.protocol); this.bump("device"); }
  async setDevice(id, { quiet = false } = {}) {
    const d = this.devices.find((x) => x.id === id);
    if (!d) return;
    this.deviceId = id; lsSet("device", id);
    this.bump("device");
    if (d.kind !== "sim") { const ok = await d.probe(); if (!ok && !quiet) this.toast(d.status, "bad"); }
    this.bump("device");
    this.compile();
  }

  // ---------- hypotheses (guide §29) ----------
  /** The project's hypotheses judged against the store, recomputed when the program compiles, the store changes or the device does. */
  get hypotheses() {
    const key = `${this.version("compile")}|${this.version("store")}|${this.evidenceId}`;
    if (this._hypKey !== key) {
      this._hypKey = key;
      this._hyp = this.project ? std.evidence.evaluateHypotheses(this.project, { store: this.store, prog: this.prog, device: this.evidenceId, target: this.device.target }) : [];
    }
    return this._hyp;
  }

  // ---------- measure ----------
  async measure({ device = this.device, quiet = false } = {}) {
    if (!this.prog) { if (!quiet) this.toast(this.run?.ok ? "This pipeline does not end in GPU kernels; use Run in the Code view" : "Fix the compile errors first", "bad"); return null; }
    // a server executor measures as a job: its records arrive when it is done (the server section)
    if (device.server) { await this.proposeJob(device, { quiet }); return null; }
    if (this.measuring) return null;
    if (device.kind === "cuda" && !(await device.probe())) { this.toast("The CUDA runner is not connected. Export a bundle from Devices instead.", "bad"); this.showView("devices"); return null; }
    if (device.kind === "webgpu" && !(await device.probe())) { this.toast(device.status, "bad"); return null; }
    this.measuring = { device: device.id, done: 0, total: this.prog.kernels.length };
    this.bump("measure");
    const t0 = performance.now();
    let res;
    try {
      // a device with a protocol reports repetitions × kernels steps as it goes; others report each kernel once
      const progress = device.measureKernels
        ? { onStep: (done, total) => { Object.assign(this.measuring, { done, total }); this.bump("measure"); } }
        : { onKernel: () => { this.measuring.done++; this.bump("measure"); } };
      res = await measureProgram(this.prog, device, { store: this.store, run: this.run, kernelPins: this.kernelPins, ...progress });
    } catch (e) { this.measuring = false; this.toast("Measure failed: " + e.message, "bad"); this.bump("measure"); return null; }
    const rec = { t: Date.now(), device: device.id, evidenceId: device.evidenceId, deviceName: device.label, total: res.total, kernels: res.kernels.map((r) => ({ name: r.kern.name, identity: r.kern.identity, row: r.kern.row, us: r.us, metrics: r.metrics, check: r.check, error: r.error, record: r.record?.id ?? null })), ms: performance.now() - t0, preset: this.preset?.id };
    this.measures[device.id] = rec;
    this.history.push({ t: rec.t, device: device.id, total: rec.total, rows: rec.kernels.map((x) => x.row).join(" | "), preset: rec.preset });
    if (this.history.length > 300) this.history.shift();
    this.measuring = false;
    const bad = rec.kernels.filter((x) => x.error || x.check?.ok === false);
    this.log("measure", `${device.label}: ${fmtUs(rec.total)} over ${rec.kernels.length} kernel${rec.kernels.length === 1 ? "" : "s"}${bad.length ? ` · ${bad.length} failed checks` : ""}`, { bad: bad.length > 0 });
    if (!quiet) this.toast(`${device.label}: ${fmtUs(rec.total)}${bad.length ? ` · ${bad.length} kernel check${bad.length > 1 ? "s" : ""} failed` : ""}`, bad.length ? "bad" : "");
    this.bump("measure", "store");
    this.compile();
    return rec;
  }
  // ---------- compare (guide §28: paired) ----------
  /**
   * Measure one kernel under two schedules (full knob objects, a and b) in one protocol run, so both see the same GPU
   * state and their records share a pairId; the Compare panel reads ev.ratio over them. → the measurePaired result.
   */
  async compare(identity, a, b, { device = this.device } = {}) {
    if (!this.prog || this.measuring) return null;
    if (device.kind !== "sim" && device.probe && !(await device.probe())) { this.toast(device.status, "bad"); return null; }
    const name = this.prog.kernels.find((kn) => kn.identity === identity)?.name ?? identity;
    this.measuring = { device: device.id, done: 0, total: 2, compare: identity };
    this.bump("measure");
    let res;
    try {
      res = await measurePaired({ pipeline: this.pipe, graph: this.graph, params: this.params, device, store: this.store, identity, rows: [canonRow(a), canonRow(b)],
        onStep: (done, total) => { Object.assign(this.measuring, { done, total }); this.bump("measure"); } });
    } catch (e) { this.measuring = false; this.bump("measure"); this.toast(`Compare failed: ${e.message}`, "bad"); return null; }
    this.measuring = false;
    this.comparison = { identity, name, device: device.evidenceId ?? device.id, a, b, pairId: res.pairId, t: Date.now() };
    const bad = res.sides.filter((s) => !s.record?.validity.ok);
    this.log("measure", `compare ${name} on ${device.label}: ${res.sides.map((s) => s.row).join(" vs ")}${bad.length ? ` · ${bad.length} invalid` : ""}`, { bad: bad.length > 0 });
    this.bump("measure", "store", "compare");
    this.compile();
    return res;
  }

  // ---------- tune ----------
  async tune({ strategy = "spmcts", budget = 24 } = {}) {
    if (!this.prog) return this.toast("Nothing to tune: the program has no GPU kernels", "bad");
    if (this.tuning?.running) return;
    const device = this.device;
    if (device.kind !== "sim" && !(await device.probe())) return this.toast(device.status, "bad");
    const ctl = new AbortController();
    this.tuning = { running: true, strategy, budget, history: [], best: null, ctl, device: device.id, t0: Date.now() };
    this.log("tune", `${strategy} on ${device.label}, budget ${budget}`);
    this.bump("tune");
    try {
      const r = await runTune({ pipeline: this.pipelineFor(this.project), graph: this.graph, params: this.params, device, store: this.store, strategy: strategy === "sweep-all" ? "sweep" : strategy, perKernel: strategy === "sweep-all" ? Infinity : 6, budget, signal: ctl.signal,
        onProgress: ({ history, best }) => { this.tuning.history = history.slice(); this.tuning.best = best; this.bump("tune"); } });
      Object.assign(this.tuning, { running: false, done: true, best: r.best, exhausted: r.exhausted });
      this.log("tune", `best ${fmtUs(r.best?.us)} after ${r.history.length} programs`);
      this.toast(`Tuned: best ${fmtUs(r.best?.us)} after ${r.history.length} programs. The compile now uses the measured rows.`);
    } catch (e) { this.tuning.running = false; this.tuning.error = e.message; this.toast("Tuning stopped: " + e.message, "bad"); }
    this.bump("tune", "store");
    this.compile();
  }
  stopTune() { this.tuning?.ctl?.abort(); }

  // ---------- bundles (CUDA without a live connection) ----------
  bundleJSON(opts = {}) { if (!this.prog) return null; return JSON.stringify(makeBundle(this.prog.kernels, opts), null, 1); }
  importResults(json) {
    if (!this.prog) throw new Error("compile a GPU program first");
    const res = typeof json === "string" ? JSON.parse(json) : json;
    const out = ingest(res, this.prog.kernels);
    const device = this.devices.find((d) => d.kind === "cuda" && !d.server);
    if (!device) throw new Error("this page is served by the Kiln server: measure on a server executor, or import records in Evidence");
    device.adopt(res.device || { name: "unknown" }, "import");
    device.label = device.name + " · imported";
    const ids = this.prog.kernels.map((kn, i) => this.store.record({ device, kern: kn, result: out[i], by: "import", activation: activationOf(kn, { run: this.run, kernelPins: this.kernelPins }) }).id);
    const rec = { t: Date.now(), device: device.id, evidenceId: device.evidenceId, deviceName: device.label, total: out.reduce((a, r) => a + (r.us || 0), 0), kernels: out.map((r, i) => ({ name: this.prog.kernels[i].name, identity: this.prog.kernels[i].identity, row: this.prog.kernels[i].row, ...r, record: ids[i] })), imported: true };
    this.measures[device.id] = rec;
    this.log("measure", `imported CUDA results: ${fmtUs(rec.total)}`);
    this.bump("measure", "store", "device");
    return rec;
  }

  // ---------- server (guide §30) ----------
  // Served by the Kiln server, the page keeps its records there (server-sync.js: the server's records are loaded,
  // the page's own are posted), offers one CUDA device per server executor, and measures on one by proposing an
  // approved job; the job's records arrive by records.added and the program recompiles with them. Server-sent events
  // only notify: hello (a new connection) re-reads records, devices and jobs. A page that holds a token but whose
  // origin is not the Kiln server (the runner's serve mode) keeps its runner device and has no server.
  async startServer() {
    const s = this.server;
    if (!s) return;
    try {
      const h = await s.health();
      if (!h?.features?.includes("jobs")) throw new Error("not the Kiln server");
      Object.assign(this.serverInfo, { state: "connected", version: h.version, executors: h.executors });
    } catch { this.server = null; this.serverInfo = { state: "none" }; this.bump("server"); return; }
    // the runner-served CUDA device would probe this origin, which is the Kiln server's
    this.devices = this.devices.filter((d) => d.kind !== "cuda" || d.server);
    this.sync = recordSync({
      client: s, store: this.store,
      onRejected: (rs) => { this.toast(`The server rejected ${rs.length} record${rs.length === 1 ? "" : "s"}: ${rs[0].reason}`, "bad"); this.log("server", `rejected ${rs.length} records: ${rs[0].reason}`, { bad: true }); },
      onError: (e) => this.log("server", `posting records failed (retried at the next change): ${e.message}`, { bad: true }),
    });
    const on = (fn) => (data) => { fn(data); this.bump("jobs"); };
    try {
      this.unsubscribe = s.subscribe({
        hello: () => this.serverReread(),
        "records.added": (d) => this.serverRecordsAdded(d),
        "device.updated": () => this.serverDevices().catch((e) => this.log("server", `reading devices failed: ${e.message}`, { bad: true })),
        "job.updated": on((v) => { this.jobs = upsertJob(this.jobs, v); this.jobSettled(v); }),
        "job.event": on((e) => { this.jobs = addJobEvent(this.jobs, e); }),
        open: () => { this.serverInfo.state = "connected"; this.bump("server"); },
        error: () => { this.serverInfo.state = "reconnecting"; this.bump("server"); },
      });
    } catch (e) { this.log("server", `no event stream (${e.message}): the page reads the server once`, { bad: true }); this.serverReread(); }
    this.bump("server", "device");
  }
  async serverReread() {
    try {
      const [r] = await Promise.all([this.sync.load(), this.serverDevices(), this.serverJobs()]);
      if (r.added) { this.log("server", `loaded ${r.added} record${r.added === 1 ? "" : "s"} from the server`); if (this.ready) this.compile(); }
      this.sync.flush(); // what this page holds that the server lacks
    } catch (e) { this.log("server", `reading the server failed: ${e.message}`, { bad: true }); }
  }
  async serverDevices() {
    const views = await this.server.devices.list();
    const was = this.evidenceId;
    const devs = serverDevices(views, this.devices.filter((d) => d.server), this.server, lsGet("protocol:cuda", null));
    this.devices = [...this.devices.filter((d) => !d.server), ...devs];
    this.serverInfo.executors = devs.length;
    this.bump("device", "server");
    // a server device saved as the selection exists only now
    if (this.ready && this.device.server && !this._serverPicked) { this._serverPicked = true; return this.setDevice(this.deviceId, { quiet: true }); }
    if (this.ready && this.evidenceId !== was) this.compile();
  }
  async serverJobs() {
    const list = await this.server.jobs.list();
    // a job.updated view carries no events: keep those already read
    this.jobs = list.reduce((acc, v) => upsertJob(acc, v), this.jobs.filter((j) => list.some((v) => v.id === j.id)));
    this.bump("jobs");
  }
  async serverRecordsAdded(d) {
    if (!d) return;
    let r;
    try { r = await this.sync.added(d); } catch (e) { this.log("server", `fetching new records failed: ${e.message}`, { bad: true }); return; }
    const mine = d.job ? this.awaiting.get(d.job) : null;
    if (mine) { this.awaiting.delete(d.job); this.jobMeasured(d.job, mine, d.ids || []); }
    if (r.added) this.log("server", `${r.added} new record${r.added === 1 ? "" : "s"}${d.job ? ` from job ${d.job.slice(4, 12)}` : ""}`);
    if ((r.added || mine) && this.ready) this.compile();
  }
  /** A job this page proposed has records: they become this device's last measurement, as Measure's would. */
  jobMeasured(job, { device: id, preset }, ids) {
    const device = this.devices.find((x) => x.id === id), recs = ids.map((x) => this.store.records.get(x)).filter(Boolean);
    if (!device || !recs.length) return;
    const kernels = recs.map((r) => {
      const us = r.timing.samples.length ? median(r.timing.samples) : NaN, l = r.kernel.launch, raw = (r.timing.raw || []).flat();
      return { name: r.kernel.name, identity: r.kernel.identity, row: r.kernel.row, us, record: r.id, error: r.timing.samples.length ? undefined : r.check.detail,
        check: { ok: r.check.ok, n: r.check.sampled, message: r.check.detail }, metrics: { us, kind: "CUDA events (server job)", min: raw.length ? Math.min(...raw) : undefined, threads: l?.block, blocks: l?.grid, smem: l?.smem } };
    });
    const rec = { t: Date.now(), device: device.id, evidenceId: recs[0].device.id, deviceName: device.label, total: kernels.reduce((a, x) => a + x.us, 0), kernels, job, preset };
    this.measures[device.id] = rec;
    this.history.push({ t: rec.t, device: device.id, total: rec.total, rows: kernels.map((x) => x.row).join(" | "), preset });
    this.log("measure", `${device.label}: ${fmtUs(rec.total)} over ${kernels.length} kernel${kernels.length === 1 ? "" : "s"} (job ${job.slice(4, 12)})`);
    this.bump("measure");
  }
  /** A job this page proposed ended: say so once. */
  jobSettled(v) {
    if (!v || !["done", "failed", "cancelled"].includes(v.status) || !this.proposed.has(v.id)) return;
    this.proposed.delete(v.id);
    this.toast(v.status === "done" ? `Job done on ${v.executor}: ${v.records.length} record${v.records.length === 1 ? "" : "s"}; the compile now uses them` : `Job ${v.status} on ${v.executor}${v.error ? `: ${v.error}` : ""}`, v.status === "failed" ? "bad" : "");
  }
  /**
   * Measure on a server executor: propose this program's kernels as one job and show Jobs. The user's job is approved
   * on creation; an agent's ({ proposer: "agent" }) waits in Jobs for the user to approve it. → the job, or null.
   */
  async proposeJob(device, { quiet = false, proposer = "user", reason = null } = {}) {
    const kernels = this.prog.kernels, run = this.run, pins = { ...this.kernelPins }, n = kernels.length, user = proposer === "user";
    const what = this.preset ? `${this.preset.id} ${this.preset.title}` : this.project?.name ?? "the program";
    const spec = jobSpec(kernels, { executor: device.executor, protocol: device.protocol, approve: user, reason: reason ?? `Measure ${what}: ${n} kernel${n === 1 ? "" : "s"} on ${device.label}`, activationOf: (kern) => activationOf(kern, { run, kernelPins: pins }) });
    let job;
    try { job = await this.server.jobs.create(spec, { proposer }); }
    catch (e) { this.toast(`The server did not take the job: ${e.message}`, "bad"); this.log("measure", `job refused: ${e.message}`, { bad: true }); return null; }
    this.jobs = upsertJob(this.jobs, job);
    this.awaiting.set(job.id, { device: device.id, preset: this.preset?.id });
    this.proposed.add(job.id);
    const size = `${n} kernel${n === 1 ? "" : "s"} × ${spec.protocol.reps} repetitions`;
    this.log("measure", `${device.label}: job ${job.id.slice(4, 12)} ${user ? "approved" : `proposed by the ${proposer}`}, ${size}`);
    if (!quiet) this.toast(user ? `Job approved on ${device.executor}: ${size}. Its records arrive when it is done.` : `The ${proposer} proposed a job on ${device.executor}: ${size}. Approve it in Jobs.`);
    this.select({ job: job.id });
    this.bump("jobs");
    this.showView("jobs");
    return job;
  }
  /** Read a job with its events (the Jobs view's side panel). */
  async openJob(id) {
    this.select({ job: id });
    if (!this.server) return;
    try { this.jobs = upsertJob(this.jobs, await this.server.jobs.get(id)); this.bump("jobs"); }
    catch (e) { this.toast(`Could not read the job: ${e.message}`, "bad"); }
  }
  /** Approve or cancel a job (the Jobs view). */
  async jobAction(id, action) {
    try { this.jobs = upsertJob(this.jobs, await this.server.jobs[action](id)); this.bump("jobs"); }
    catch (e) { this.toast(`Could not ${action} the job: ${e.message}`, "bad"); }
  }
  /** Evidence's Forget: the same devices' records on the server too. */
  async forgetOnServer(devices) {
    if (!this.sync || !devices.length) return;
    try { const n = await this.sync.forget(devices); this.log("server", `forgot ${n} record${n === 1 ? "" : "s"} on the server`); }
    catch (e) { this.toast(`The server kept its records: ${e.message}`, "bad"); }
  }

  // ---------- presets you keep ----------
  savePreset({ asNew = false } = {}) {
    const meta = headerOf(this.script);
    let id = this.preset?.mine && !asNew ? this.preset.id : null;
    if (!id) { const n = this.mine.reduce((m, p) => Math.max(m, +String(p.id).replace(/\D/g, "") || 0), 0) + 1; id = "U-" + String(n).padStart(2, "0"); }
    let text = this.script;
    if (!/^\s*\/\*\*/.test(text)) text = `/** ${id} ${meta.title === "Untitled" ? "My project" : meta.title}\n *  group  Mine\n *  about  \n */\n` + text;
    else text = text.replace(/\/\*\*\s*([A-Z]-\d+)?/, `/** ${id}`);
    const entry = { id, ...headerOf(text), group: "Mine", text, notes: this.notes };
    this.mine = this.mine.filter((p) => p.id !== id).concat(entry);
    lsSet("mine", this.mine);
    this.preset = { ...entry, mine: true }; this.script = text; this.savedScript = text; this.savedNotes = this.notes;
    lsSet("last", id);
    this.bump("preset", "code", "notes");
    this.toast(`Saved as ${id} in My presets (this browser)`);
    return id;
  }
  deletePreset(id) { this.mine = this.mine.filter((p) => p.id !== id); lsSet("mine", this.mine); this.bump("preset"); }
  newPresetFromText(text) {
    const n = this.mine.reduce((m, p) => Math.max(m, +String(p.id).replace(/\D/g, "") || 0), 0) + 1;
    const id = "U-" + String(n).padStart(2, "0");
    text = /^\s*\/\*\*/.test(text) ? text.replace(/\/\*\*\s*([A-Z]-\d+)?/, `/** ${id}`) : `/** ${id} New project\n *  group  Mine\n */\n` + text;
    this.mine.push({ id, ...headerOf(text), group: "Mine", text });
    lsSet("mine", this.mine);
    this.bump("preset");
    return id;
  }

  summary() {
    const m = this.measures[this.deviceId];
    return {
      kernels: this.prog?.kernels.length ?? 0, total: m?.total ?? null, stale: m && this.prog ? m.kernels.map((x) => x.identity + x.row).join() !== this.prog.kernels.map((x) => x.identity + x.row).join() : false,
      errors: this.diags.filter((d) => d.level === "error").length, failing: (this.e2e && this.e2e.ok === false ? 1 : 0) + (m ? m.kernels.filter((x) => x.error || x.check?.ok === false).length : 0),
    };
  }
}
// a check returns true (pass), a string (why it fails), or { ok, message } (a result with something to say)
function checkResult(c, r) {
  if (r === true || r == null) return { name: c.name, ok: true, message: "ok" };
  if (typeof r === "object" && "ok" in r) return { name: c.name, ok: !!r.ok, message: String(r.message ?? (r.ok ? "ok" : "failed")), info: !!r.ok && r.message != null };
  return { name: c.name, ok: false, message: String(r) };
}
function canEval(g) { return [...g.nodes.values()].every((n) => n.def.spec.eval || n.def.name === "kiln.input"); }
// how many scalar operations evaluating the program takes (loop statements × trip counts), to keep the
// end-to-end check interactive
function estimateWork(run) {
  const g = run.at("loop");
  if (!g) return run.graph.size * 1000;
  let w = 0;
  const walk = (ss, trips) => { for (const s of ss) { if (s.s === "for") walk(s.body, trips * s.n); else w += trips; } };
  for (const n of g.nodes.values()) if (n.name === "loop.kernel") walk(schedule(n.attrs.expr, n.attrs.shape).stmts, 1);
  return w;
}

export const wb = new Workbench();
export { REFERENCE, GUIDELINES, RUNNER };
