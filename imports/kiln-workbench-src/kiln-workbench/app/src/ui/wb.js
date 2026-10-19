// The workbench: owns the script, the compiled run, devices, measurements, the evidence store and
// tuning. React views subscribe to named channels (the Octavo Lab pattern).
import { k, ParamSet } from "../core/kiln.js";
import { runScript, headerOf, lineOf } from "../core/script.js";
import { std } from "../std/index.js";
import { programOf } from "../std/program.js";
import { makeDevices, bundle as makeBundle, ingest } from "../std/devices.js";
import { Store } from "../std/store.js";
import { tune as runTune, measureProgram } from "../std/tune.js";
import { schedule } from "../std/loop.js";
import { canonRow } from "../std/tile.js";
import { Tensor, compare, fmtUs, clip } from "../core/util.js";
import { PRESETS } from "../presets.gen.js";
import { REFERENCE, GUIDELINES, RUNNER } from "../docs.gen.js";
import * as Dock from "./dock.js";

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
    this.deviceId = lsGet("device", "sim:rtx5090");
    this.store = new Store(lsGet("evidence", { rows: [] }).rows);
    this.store.on(() => { clearTimeout(this._st); this._st = setTimeout(() => lsSet("evidence", this.store.toJSON()), 400); this.bump("store"); });
    this.measures = {}; this.history = []; this.measuring = false;
    this.tuning = null;
    this.events = [];
    this.sel = { ir: null, node: null, step: null, kernel: null, decision: null, src: "cuda" };
    this.ui = { theme: lsGet("theme", "auto") };
    this.layout = (() => { try { const l = lsGet("layout", null); return l ? Dock.normalize(l) : Dock.defaultLayout(); } catch { return Dock.defaultLayout(); } })();
    // layouts saved before the Notes view existed: put Notes beside Code
    if (!Dock.openViews(this.layout).includes("notes")) { const t = Dock.tileOf(this.layout, "code") || Dock.tiles(this.layout)[0]; if (t) this.layout = Dock.normalize(Dock.moveToTab(this.layout, "notes", t.id, 0)); }
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
    const kp = this.kernelPins;
    const kernelPolicy = { name: "kernel pin", rank: (fp) => { const want = kp[fp.key]; if (!want) return null; const i = fp.options.findIndex((o) => canonRow(o.knobs) === want || k.knobs.canonical(o.knobs) === want); return i < 0 ? null : { order: [i, ...fp.options.map((_, j) => j).filter((j) => j !== i)], by: "pinned" }; } };
    return base.with({ target: device.target, decide: k.decide.chain(kernelPolicy, base._decide) });
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
    const run = pipe.run(g, { params: ps, target: device.target, ctx: { deviceId: device.id, store: this.store } });
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
    const run = pipe.run(g, { params: this.params, target: this.device.target, ctx: { deviceId: this.device.id, store: this.store } });
    this.run = run; this.pipe = pipe;
    this.compileMs = performance.now() - t0;
    this.prog = run.ok && run.graph.nodes.size && [...run.graph.nodes.values()].some((n) => n.name === "gpu.kernel") ? programOf(run.graph) : null;
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
  async setDevice(id, { quiet = false } = {}) {
    const d = this.devices.find((x) => x.id === id);
    if (!d) return;
    this.deviceId = id; lsSet("device", id);
    this.bump("device");
    if (d.kind !== "sim") { const ok = await d.probe(); if (!ok && !quiet) this.toast(d.status, "bad"); }
    this.bump("device");
    this.compile();
  }

  // ---------- measure ----------
  async measure({ device = this.device, quiet = false } = {}) {
    if (!this.prog) { if (!quiet) this.toast(this.run?.ok ? "This pipeline does not end in GPU kernels; use Run in the Code view" : "Fix the compile errors first", "bad"); return null; }
    if (this.measuring) return null;
    if (device.kind === "cuda" && !(await device.probe())) { this.toast("The CUDA runner is not connected. Export a bundle from Devices instead.", "bad"); this.showView("devices"); return null; }
    if (device.kind === "webgpu" && !(await device.probe())) { this.toast(device.status, "bad"); return null; }
    this.measuring = { device: device.id, done: 0, total: this.prog.kernels.length };
    this.bump("measure");
    const t0 = performance.now();
    let res;
    try {
      res = await measureProgram(this.prog, device, { store: this.store, onKernel: () => { this.measuring.done++; this.bump("measure"); } });
    } catch (e) { this.measuring = false; this.toast("Measure failed: " + e.message, "bad"); this.bump("measure"); return null; }
    const rec = { t: Date.now(), device: device.id, deviceName: device.label, total: res.total, kernels: res.kernels.map((r) => ({ name: r.kern.name, identity: r.kern.identity, row: r.kern.row, us: r.us, metrics: r.metrics, check: r.check, error: r.error })), ms: performance.now() - t0, preset: this.preset?.id };
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
    const device = this.devices.find((d) => d.kind === "cuda");
    if (res.device) { device.info = res.device; device.name = `CUDA ${res.device.name || ""}`.trim(); device.label = device.name + " · imported"; }
    const rec = { t: Date.now(), device: device.id, deviceName: device.label, total: out.reduce((a, r) => a + (r.us || 0), 0), kernels: out.map((r, i) => ({ name: this.prog.kernels[i].name, identity: this.prog.kernels[i].identity, row: this.prog.kernels[i].row, ...r })), imported: true };
    this.prog.kernels.forEach((kn, i) => this.store.record({ device: device.id, kern: kn, result: out[i], by: "import" }));
    this.measures[device.id] = rec;
    this.log("measure", `imported CUDA results: ${fmtUs(rec.total)}`);
    this.bump("measure", "store", "device");
    return rec;
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
