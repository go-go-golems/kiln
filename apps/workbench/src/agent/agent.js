// The workbench's coding agent (after the Octavo Lab architect): one tool, `eval`. Its code runs in a sandboxed
// frame (frame.js, guide §31) with Kiln's script names and the workbench namespaces; every namespace call that reads
// or changes the workbench is a message this page answers, checked here against the run mode. Every step can be
// reverted (Auto), approved first (Ask), or the agent can only look and measure without recording (Read-only).
import * as Dock from "../ui/dock.js";
import { wb, lsGet, lsSet, REFERENCE, GUIDELINES } from "../ui/wb.js";
import { knobs as KN } from "@kiln/kiln/core/kiln.js";
import { clip, summarize, fmtUs, median } from "@kiln/kiln/core/util.js";
import { analyze, estimate } from "@kiln/kiln/std/tile.js";
import { simulateKernel } from "@kiln/kiln/std/program.js";
import { measureProgram } from "@kiln/kiln/std/tune.js";
import { errs, warns, runSummary, e2eLine, rowOf, r3, yaml, toWire, fromWire } from "./encode.js";
import { runInFrame } from "./sandbox.js";

export const TIER_LABEL = { quick: "Fast", default: "Balanced", complex: "Deep" };
const HISTORY = 16;
const OUT_MAX = 9000;
/** Evals per answer; the eval after the last one is refused with a message to answer (guide §31) */
export const EVAL_CAP = 8;
const now = () => Date.now();
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const paint = () => { if (paint.t) return; paint.t = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => { paint.t = 0; wb.bump("agent"); }); };

export const ERRORS = {
  cancelled: "Stopped.",
  not_granted: "Claude is not allowed on this page. Allow it when asked, then try again.",
  rate_limited: "Too many requests or the usage limit is reached. Try again later.",
  prompt_too_large: "This conversation is too long for one request. Start a new chat.",
  refused: "Claude declined this request. Rephrase it.",
  tools_unavailable: "This view cannot run the agent's eval tool.",
  session_expired: "Sign in again, then retry.",
  sampling_disabled: "Claude is not available for this account.",
  empty_completion: "Claude returned nothing. Simplify the request.",
  no_model: "The Kiln server has no model configured: start it with KILN_MODEL set.",
  no_api_key: "The Kiln server has no API key: start it with ANTHROPIC_API_KEY set.",
  upstream_error: "The model provider returned an error. Try again.",
  bad_token: "This page's session with the Kiln server is out of date. Reload the page.",
};
const friendly = (e) => ERRORS[e?.code] ?? `Something went wrong (${e?.code ?? e?.message ?? "unknown"}). Try again.`;

// ---------------------------------------------------------------- state
// settings.scripts: "hold" keeps a script the agent writes out of this page until the user runs it; "run" runs it
// at once, with the user's authority (wb.holdScript). transport runs one eval: the sandbox frame, or a test's.
export const agent = { settings: { tier: "default", effort: "medium", mode: "auto", scripts: "hold", ...lsGet("agentSettings", {}) }, conv: null, busy: false, ctl: null, transport: null };
const SNAPS = new WeakMap();
const PENDING = new Map();
export const steps = (m) => (m.parts || []).filter((p) => p.type === "tool");
export const canRevert = (part) => SNAPS.has(part);
export function setSetting(key, v) { agent.settings[key] = v; lsSet("agentSettings", agent.settings); wb.bump("agent"); }

export function convs() { return (agent.convs ??= lsGet("convs", [])); }
export function newConv() { agent.conv = { id: newId("c"), title: "New chat", createdAt: now(), updatedAt: now(), messages: [] }; wb.bump("agent"); return agent.conv; }
export function saveConv(c = agent.conv) {
  if (!c || !c.messages.length) return;
  c.updatedAt = now();
  let json = JSON.stringify(c);
  if (json.length > 300000) { for (const m of c.messages) for (const p of m.parts ?? []) if (p.type === "tool" && p.result?.length > 1500) p.result = clip(p.result, 1500); json = JSON.stringify(c); }
  const list = convs(), rec = JSON.parse(json), i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = rec; else list.unshift(rec);
  while (list.length > 30) list.pop();
  lsSet("convs", list);
  wb.bump("convs");
}
export function openConv(id) {
  const c = convs().find((x) => x.id === id);
  if (!c) return;
  agent.conv = JSON.parse(JSON.stringify(c));
  for (const m of agent.conv.messages) if (m.pending) { m.pending = false; m.error ??= "Interrupted."; }
  wb.bump("agent");
}
export function deleteConv(id) {
  const list = convs(), i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
  lsSet("convs", list);
  if (agent.conv?.id === id) newConv();
  wb.bump("convs", "agent");
}

// ---------------------------------------------------------------- what the agent sees each turn
export function contextSummary() {
  const s = wb.summary();
  const m = wb.measures[wb.deviceId];
  const e = wb.e2e;
  const ctx = {
    preset: wb.preset ? `${wb.preset.id} ${wb.preset.title}${wb.preset.mine ? " (mine)" : ""}` : null,
    editor: { lines: wb.script.split("\n").length, saved: wb.script === wb.savedScript, errors: errs(wb.diags).slice(0, 3), warnings: warns(wb.diags).length, ...(wb.pending ? { held: HELD } : {}) },
    notes: { lines: wb.notes ? wb.notes.split("\n").length : 0, saved: wb.notes === wb.savedNotes, sections: (wb.notes.match(/^## .*/gm) || []).map((h) => h.slice(3)).slice(0, 12) },
    compile: runSummary(wb.run, wb.prog),
    check: e2eLine(e),
    device: wb.device.label,
    measured: m ? { total: fmtUs(m.total), stale: s.stale, failing: s.failing } : null,
    pins: { ...wb.params.pinned(), ...(Object.keys(wb.kernelPins).length ? { kernelPins: Object.keys(wb.kernelPins).length } : {}) },
    evidenceRows: wb.store.size,
    ...(wb.tuning?.running ? { tuning: `${wb.tuning.history.length}/${wb.tuning.budget}` } : {}),
  };
  const sel = Object.fromEntries(Object.entries(wb.sel).filter(([key, v]) => v != null && key !== "src"));
  ctx.view = { onScreen: Dock.ALL_VIEWS.filter((v) => wb.isVisible(v)), ...(Object.keys(sel).length ? { selected: sel } : {}) };
  return ctx;
}

const HELD = "the editor holds a script you wrote that the user has not run: the page's compile, kernels, forks and measurements are of the previous script until they press Run in the Code view";
const AGENT_SCOPE = [
  ["wb.context()", "the same summary as the [context] block"],
  ["editor.get() · editor.set(text) · editor.edit(find, replace)", "read or change the project script; set/edit return {ok, errors, warnings, compile, check, ran}. ran is false when the page holds your script for the user to run (the default): the summary is then this frame's compile of it"],
  ["notes.get() · notes.set(markdown) · notes.edit(find, replace) · notes.section(title)", "the project's notes (the Notes view): a Markdown tutorial with $TeX$, $$display math$$, tables, > **Try** call-outs and lab: links that drive the workbench (lab:param?name=n&value=v, lab:pin?TPB=128, lab:measure, lab:device?id=sim:h100, lab:tune?budget=16, lab:view?name=perf)"],
  ["editor.check(text?, { device, pins })", "compile a script in this frame, as the page would (nothing changes): {ok, errors, warnings, compile, check, run, prog, graph, project} — run and prog are live objects to inspect"],
  ["compile()", "recompile the editor's script in the page now; returns the compile summary"],
  ["ir.levels() · ir.text(level, { bodies, types, only }) · ir.node(id, level?) · ir.find(op, level?) · ir.graph(level?)", "IR checkpoints of the editor's script, compiled in this frame (input, torch, tensor, loop, tile, kernel, gpu …); `only` is a predicate n => bool; ir.graph returns a kiln Graph"],
  ["ir.eval(level?, inputs?) · ir.compare(levelA, levelB)", "interpret an IR level on the project's inputs; compare two levels' outputs"],
  ["trace.passes() · trace.steps({ pass, rule, node, declined, limit }) · trace.step(i) · trace.why(node)", "what each pass did; one step with its diff; every rule that touched or declined a node"],
  ["forks.list() · forks.get(i) · forks.pin(i, optionIndex | row) · forks.unpin(i)", "decisions with every option's model and measured time; pinning fixes one kernel's schedule (by its identity)"],
  ["params.list() · params.set(name, value) · params.pin({ name: value }) · params.unpin(name?)", "program sliders, pipeline params and global knob pins (MAP, TPB, …)"],
  ["kernels.list() · kernels.get(name) · kernels.source(name, 'cuda' | 'wgsl' | 'kernel' | 'tile' | 'loop') · kernels.simulate(name, { device })", "the compiled kernels; simulate runs one on a simulated GPU without recording"],
  ["devices.list() · devices.current() · devices.use(id)", "sim:rtx5090 sim:rtx4090 sim:h100 sim:a100 sim:gb10 sim:orin webgpu cuda"],
  ["measure({ device }) · tune({ strategy: 'spmcts' | 'sweep', budget })", "run every kernel (time, metrics, sampled check vs the reference; records evidence) · search schedules"],
  ["evidence.list({ device, all }) · evidence.best(name) · evidence.clear({ device })", "measurement records (median of repetitions, n, status fresh / stale / partial / invalid); only fresh valid ones decide schedules"],
  ["checks.e2e() · checks.outputs()", "the end-to-end check (last evaluable IR vs the frontend) and the output values"],
  ["presets.list() · presets.get(id) · presets.load(id) · presets.save({ asNew })", "presets; saving keeps them in this browser as U-NN"],
  ["jobs.list() · jobs.propose({ device, reason })", "CUDA jobs on the Kiln server's devices (devices.list() marks them): a job you propose waits for the user's approval in the Jobs view, and its records arrive when it is done; you cannot approve one"],
  ["chat.table(rows, title) · chat.propose(script, title) · chat.code(text, title, lang) · chat.show(view, sel) · chat.place(view, { beside | with, side })", "evidence in the chat; bring a view forward (views: notes code agent reference ir graph trace kernels perf knobs tune evidence devices events) and select {ir, node, step, kernel, decision, record}"],
  ["ref.section(name) · ref.all()", "the API reference"],
  ["k, P, std, N, T, nn, tensor, Tensor, ix, E, KB, kx, project, param", "the same names as project scripts: build dialects, rules, passes, pipelines and programs here to experiment"],
  ["log(...) · console.log(...)", "captured and returned with the result"],
];


function instructions(conv) {
  const mode = agent.settings.mode;
  const presets = wb.presets.map((p) => `${p.id} ${p.title}`).join(" · ");
  return `[current conversation] ${conv.title} · ${conv.messages.length} messages so far (older ones may be trimmed).
[run mode] ${mode === "auto" ? "Auto: your evals run immediately; the user can revert any step." : mode === "ask" ? "Ask: each eval waits for the user to approve it, so batch work into fewer, clearer steps." : "Read-only: you may read, compile in isolation (editor.check), simulate and measure without recording, and explain; anything that changes the editor, pins, the device, presets or the evidence throws ReadOnlyError."}

${GUIDELINES}

You have exactly one tool, eval. Its code runs in a sandboxed frame as the body of an async function (finish with \`return value\`). The frame has no network, no storage and no access to the page: the namespaces below are its only way to the workbench, and each call is a message the page checks against the run mode. Every namespace call returns a promise: always await it (ir, trace, editor.check and the kiln names run in the frame; await is harmless there). Arguments and results are data: functions and live objects cannot be sent to the page, so use editor.check, ir and trace, which run in the frame, for live objects. At most ${EVAL_CAP} evals per answer. In scope:
${AGENT_SCOPE.map(([a, b]) => `- ${a}: ${b}`).join("\n")}
The returned value comes back as YAML (a string verbatim), cut near 9,000 characters: return small, specific data, never whole IRs or sources unless asked.
Each user message starts with a [context] block only when it changed. It does not include the script: read it with editor.get().

# The API (same as project scripts)
${REFERENCE}

# Presets the user can load
${presets}`;
}

function turnsFor(text, conv, upto) {
  const win = conv.messages.slice(0, upto).slice(-HISTORY);
  const hist = [];
  for (const m of win) {
    if (m.role === "user") hist.push({ role: "user", content: (m.ctx ? `[context]\n${m.ctx}\n\n` : "") + m.text });
    else {
      let c = m.text || "";
      for (const p of steps(m)) c += `\n[eval]\n${clip(p.code, 1500)}\n→ ${p.status}:\n${clip(p.result ?? "", 900)}` + (p.reverted ? "\n[the user reverted this step and everything after it]" : "");
      if (m.error) c += `\n[error: ${m.error}]`;
      if (c.trim()) hist.push({ role: "assistant", content: clip(c, 12000) });
    }
  }
  while (hist.length && hist[0].role !== "user") hist.shift();
  const ctx = JSON.stringify(contextSummary());
  const last = [...win].reverse().find((m) => m.role === "user" && m.ctx);
  const changed = !last || last.ctx !== ctx;
  const head = changed ? `[context]\n${ctx}` : "[context unchanged since your last message; call wb.context() for more]";
  const turns = [{ role: "user", content: instructions(conv) }, ...hist, { role: "user", content: `${head}\n\n[user message]\n${text}` }];
  const bytes = () => turns.reduce((a, t) => a + t.content.length, 0);
  while (bytes() > 230000 && turns.length > 3) turns.splice(1, 1);
  const merged = [];
  for (const t of turns) { const prev = merged[merged.length - 1]; if (prev && prev.role === t.role) prev.content += "\n\n" + t.content; else merged.push({ ...t }); }
  return { turns: merged, ctx: changed ? ctx : null };
}

// ---------------------------------------------------------------- sending
export async function send(text) {
  if (agent.busy) return stop();
  text = String(text ?? "").trim();
  if (!text) return;
  return sendCore(text);
}
export function stop() { agent.ctl?.abort(); }

export async function sendCore(text, { reuse = null, override = null } = {}) {
  const sample = wb.sample;
  const conv = agent.conv ?? newConv();
  if (!conv.messages.length && conv.title === "New chat") conv.title = clip(text, 60);
  const upto = reuse ?? conv.messages.length;
  const { turns, ctx } = turnsFor(text, conv, upto);
  if (reuse == null) conv.messages.push({ role: "user", text, ctx, at: now() });
  else { conv.messages[reuse].ctx = ctx; conv.messages.splice(reuse + 1); }
  const st = { ...agent.settings, ...override };
  const msg = { role: "assistant", text: "", parts: [], pending: true, at: now(), tier: st.tier, effort: st.effort, mode: st.mode };
  conv.messages.push(msg);
  agent.busy = true;
  paint();
  wb.log("agent", clip(text, 120));
  if (!sample) {
    msg.pending = false;
    msg.error = "Claude is not available in this view. Open the workbench in Claude, or serve it from a Kiln server that has KILN_MODEL and ANTHROPIC_API_KEY set. The editor, compiler, simulator and tuner all work by hand.";
    agent.busy = false; paint();
    return;
  }
  agent.ctl = new AbortController();
  try {
    const r = await sample(turns, {
      signal: agent.ctl.signal, modelTier: st.tier, ...(st.tier !== "quick" ? { effort: st.effort } : {}), cache: false,
      onText: ({ text: t }) => { msg.text = t; paint(); },
      tools: [evalTool(msg)],
    });
    Object.assign(msg, { text: r.text, truncated: r.truncated, tierApplied: r.modelTierApplied });
  } catch (e) {
    msg.error = e?.code === "cancelled" ? "Stopped." : friendly(e);
    if (e?.code === "refused") msg.text = ""; else if (e?.text != null) msg.text = e.text;
  } finally {
    msg.pending = false;
    msg.doneAt = now();
    msg.usage = { evals: steps(msg).length, ms: msg.doneAt - msg.at };
    agent.busy = false;
    agent.ctl = null;
    paint();
    saveConv(conv);
  }
}
export function retry(i, override) {
  const conv = agent.conv;
  const j = conv.messages[i]?.role === "user" ? i : i - 1;
  const um = conv.messages[j];
  if (!um || um.role !== "user" || agent.busy) return;
  sendCore(um.text, { reuse: j, override });
}

// ---------------------------------------------------------------- the eval tool
const evalTool = (msg) => ({
  name: "eval",
  description: `Run JavaScript in the agent's sandboxed frame as the body of an async function. Scope: wb, editor, notes, compile, ir, trace, forks, params, kernels, devices, measure, tune, evidence, checks, presets, jobs, chat, ref, log, console and the kiln/std names (k, P, std, N, T, nn, tensor, Tensor, ix, E, KB, kx, project, param). Every workbench call returns a promise: await it. Returns "ok" plus a YAML summary of the returned value (a string comes back verbatim) and captured logs, cut near 9,000 characters; or "error" with the message and line. At most ${EVAL_CAP} per answer.`,
  inputSchema: { type: "object", properties: { code: { type: "string", description: "JavaScript statements; use await; end with return <small value>" } }, required: ["code"] },
  execute: (input, c) => runEval(String(input?.code ?? ""), c?.signal, msg),
});

export async function runEval(code, signal, msg) {
  const part = { type: "tool", code, status: "run", at: msg.text.length, t0: now() };
  msg.parts.push(part);
  paint();
  if (steps(msg).length > EVAL_CAP) return finish(part, false, yaml({ error: `the limit is ${EVAL_CAP} evals per answer: answer with what you have` }), "", null);
  const mode = msg.mode ?? agent.settings.mode;
  if (mode === "ask" && !msg.approveAll) {
    const d = await askApproval(part, signal);
    if (d === "deny") return finish(part, false, yaml({ declined: true }), "", "The user declined this step.");
    if (d === "all") msg.approveAll = true;
  }
  if (mode !== "readonly") SNAPS.set(part, snapshot());
  const api = apiOf(makeAgentScope({ mode, onPart: (p) => { msg.parts.push({ ...p, at: msg.text.length }); paint(); } }));
  let r;
  try { r = await (agent.transport ?? runInFrame)({ code, api: [...api.keys()].map((path) => ({ path })), ctx: frameContext(), onCall: (path, args) => pageCall(api, path, args), signal }); }
  catch (e) {
    wb.bump("code", "compile", "sel", "ui", "measure", "store");
    if (e?.code !== "cancelled") return finish(part, false, yaml({ error: `the sandbox failed: ${e?.message ?? e}` }), "", null);
    finish(part, false, yaml({ error: "stopped" }), "", null);
    throw new Error("stopped");
  }
  wb.bump("code", "compile", "sel", "ui", "measure", "store");
  if (signal?.aborted) { finish(part, r.ok, r.out, r.logs, null, r.lang); throw new Error("stopped"); }
  return finish(part, r.ok, r.out, r.logs, null, r.lang);
}

// ---------------------------------------------------------------- the bridge (sandbox.js ↔ frame.js)
// What the frame may call: every function of the page scope by its path ("editor.set", "measure"), and nothing else.
export function apiOf(scope) {
  const api = new Map();
  for (const [ns, v] of Object.entries(scope)) {
    if (typeof v === "function") api.set(ns, v);
    else for (const [fn, f] of Object.entries(v)) if (typeof f === "function") api.set(`${ns}.${fn}`, f);
  }
  return api;
}
// calls after which the frame's copy of the page state (script, params, pins, device, evidence) is out of date
const CHANGES = new Set(["editor.set", "editor.edit", "compile", "forks.pin", "forks.unpin", "params.set", "params.pin", "params.unpin", "devices.use", "measure", "tune", "evidence.clear", "presets.load", "presets.save"]);
export async function pageCall(api, path, args) {
  if (path === "__context") return { value: frameContext(fromWire(args[0])?.device) };
  const f = api.get(path);
  if (!f) throw new Error(`${path} is not part of the workbench API`);
  const value = await f(...fromWire(args));
  return { value: toWire(value), ...(CHANGES.has(path) ? { ctx: frameContext() } : {}) };
}
/** The page state the frame compiles the editor's script with (compile.js), as plain data, for one device. */
export function frameContext(deviceId) {
  const dev = deviceId ? wb.devices.find((d) => d.id === deviceId) : wb.device;
  if (!dev) throw new Error(`no device ${deviceId}; devices: ${wb.devices.map((d) => d.id).join(" ")}`);
  const id = dev.evidenceId ?? dev.id;
  return { script: wb.script, params: { vals: [...wb.params.vals], pins: [...wb.params.pins] }, kernelPins: { ...wb.kernelPins }, target: dev.target, deviceId: id, store: wb.store.slice(id) };
}
function finish(part, ok, out, logs, note, lang = "yaml") {
  if (out.length > OUT_MAX) out = out.slice(0, OUT_MAX) + `\n# … cut: ${out.length - OUT_MAX} more characters`;
  Object.assign(part, { status: ok ? "ok" : "err", ms: now() - part.t0, result: out, lang, logs: clip(logs, 6000) });
  paint();
  return `${ok ? "ok" : "error"}\n${note ? note + "\n" : ""}${out}${part.logs ? `\n# logs\n${part.logs}` : ""}`.slice(0, 20000);
}
function askApproval(part, signal) {
  part.status = "ask"; part.open = true; paint();
  return new Promise((resolve) => {
    PENDING.set(part, (d) => { PENDING.delete(part); part.status = "run"; part.open = false; paint(); resolve(d); });
    signal?.addEventListener("abort", () => PENDING.get(part)?.("deny"), { once: true });
  });
}
export function approve(part, choice) { PENDING.get(part)?.(choice); }

// ---------------------------------------------------------------- snapshots and revert
function snapshot() {
  return {
    script: wb.script, presetId: wb.preset?.id, savedScript: wb.savedScript, mine: JSON.parse(JSON.stringify(wb.mine)), notes: wb.notes, savedNotes: wb.savedNotes,
    params: wb.params.clone(), kernelPins: { ...wb.kernelPins }, deviceId: wb.deviceId, evidence: JSON.stringify(wb.store.toJSON()), pending: wb.pending,
  };
}
function restore(snap) {
  wb.stopTune();
  wb.mine = snap.mine; lsSet("mine", wb.mine);
  const p = wb.presets.find((x) => x.id === snap.presetId);
  if (p) wb.preset = p;
  wb.script = snap.script; wb.savedScript = snap.savedScript; wb.notes = snap.notes ?? wb.notes; wb.savedNotes = snap.savedNotes ?? wb.savedNotes;
  wb.params = snap.params.clone(); wb.kernelPins = { ...snap.kernelPins };
  wb.deviceId = snap.deviceId; lsSet("device", wb.deviceId);
  wb.store.forget(); wb.store.import(JSON.parse(snap.evidence));
  wb.pending = !!snap.pending; wb.saveDraft();
  wb.bump("code", "preset", "device", "params", "notes");
  wb.compile();
}
export function revertFrom(msg, part) {
  const st = steps(msg), i = st.indexOf(part), snap = SNAPS.get(part);
  if (!snap) return wb.toast("This step has no snapshot (it ran in Read-only mode or before a reload).", "bad");
  restore(snap);
  for (const p of st.slice(i)) p.reverted = true;
  wb.toast(i === 0 ? "Undid this answer" : `Reverted to before step ${i + 1}`);
  paint();
  saveConv();
}

// ---------------------------------------------------------------- the scope
class ReadOnlyError extends Error { constructor(what) { super(`${what} changes the workbench; the agent is in Read-only mode`); this.name = "ReadOnlyError"; } }
class HeldScriptError extends Error { constructor() { super(HELD + "; use editor.check(), ir and trace for your script"); this.name = "HeldScriptError"; } }
const RO = (obj, keys, label) => { const o = { ...obj }; for (const key of keys) o[key] = () => { throw new ReadOnlyError(`${label}.${key}`); }; return o; };

const modelUs = (run, d, knobs, target) => {
  const g = run.at("loop"), n = g?.nodes.get(d.node);
  if (!n || n.name !== "loop.kernel") return null;
  try { return estimate(analyze(n.attrs.expr, n.attrs.shape, n.args.map((a) => g.nodes.get(a).type.shape)), knobs, target).us; } catch { return null; }
};
function kernelRec(x) {
  const mt = x.metrics || {};
  return {
    name: x.name, us: r3(x.us), row: x.row, ...(x.error ? { error: x.error } : {}), check: x.check ? (x.check.ok ? "ok" : x.check.message) : null,
    ...(mt.bound ? { bound: mt.bound, occupancy: r3(mt.occupancy), limiter: mt.limiter } : {}), ...(mt.gbs != null ? { GBs: r3(mt.gbs) } : {}), ...(mt.gflops != null ? { GFLOPs: r3(mt.gflops) } : {}),
    ...(mt.ldSectorsPerReq ? { ldSectorsPerReq: r3(mt.ldSectorsPerReq) } : {}), ...(mt.bankConflicts ? { bankConflicts: r3(mt.bankConflicts) } : {}), ...(mt.divergence ? { divergence: r3(mt.divergence) } : {}),
    ...(mt.parts ? { parts: Object.fromEntries(Object.entries(mt.parts).map(([a, b]) => [a, r3(b)])) } : {}),
  };
}

// The page's half of the agent's scope: what the frame reaches over the bridge. ir, trace, editor.check, log and the
// kiln names live in the frame (frame.js).
export function makeAgentScope({ mode = "auto", onPart = () => {} } = {}) {
  // the page's compile is of the editor's script only when no script the agent wrote is held
  const current = () => { if (wb.pending) throw new HeldScriptError(); };
  const needRun = () => { current(); if (!wb.run) throw new Error("nothing is compiled; fix the script (editor.get(), wb.context().editor.errors) first"); return wb.run; };
  // ran: false makes the frame answer with its own compile of the held script
  const afterEdit = () => (wb.pending ? { ran: false, note: HELD } : { ok: !!wb.run?.ok && !errs(wb.diags).length, errors: errs(wb.diags), warnings: warns(wb.diags), compile: runSummary(wb.run, wb.prog), check: e2eLine(wb.e2e), ran: true });
  const WB = { context: () => contextSummary() };
  let editor = {
    get: () => wb.script,
    set(text) {
      if (typeof text !== "string") throw new TypeError("editor.set(text) takes the whole script as a string");
      if (agent.settings.scripts === "run") wb.runScript(text); else wb.holdScript(text);
      return afterEdit();
    },
    edit(find, replace) {
      const s = wb.script, i = s.indexOf(find);
      if (i < 0) throw new Error("editor.edit: the text to find is not in the editor (copy it exactly from editor.get())");
      if (s.indexOf(find, i + 1) >= 0) throw new Error("editor.edit: the text to find occurs more than once; include more context");
      return editor.set(s.slice(0, i) + replace + s.slice(i + find.length));
    },
  };
  const compile = () => { wb.compile(); return afterEdit(); };
  let notes = {
    get: () => wb.notes,
    set(md) { if (typeof md !== "string") throw new TypeError("notes.set(markdown) takes the whole notes as a string"); wb.setNotes(md); return { lines: md.split("\n").length, sections: (md.match(/^## .*/gm) || []).map((h) => h.slice(3)) }; },
    edit(find, replace) {
      const s = wb.notes, i = s.indexOf(find);
      if (i < 0) throw new Error("notes.edit: the text to find is not in the notes");
      if (s.indexOf(find, i + 1) >= 0) throw new Error("notes.edit: the text occurs more than once; include more context");
      return notes.set(s.slice(0, i) + replace + s.slice(i + find.length));
    },
    section(title) { const parts = wb.notes.split(/\n(?=## )/); const p = parts.find((x) => x.slice(3, 3 + title.length).toLowerCase() === String(title).toLowerCase()) || parts.find((x) => x.toLowerCase().includes(String(title).toLowerCase())); if (!p) throw new Error(`no section like "${title}"`); return p; },
  };
  const decisionAt = (i) => { const d = needRun().decisions[i]; if (!d) throw new Error(`no fork ${i}; there are ${wb.run.decisions.length}`); return d; };
  let forks = {
    list: () => needRun().decisions.map((d, i) => ({ i, rule: d.rule, node: d.node, kernel: wb.prog?.kernels.find((x) => x.identity === d.key)?.name, options: d.size, picked: d.failed ? "none legal" : rowOf(d.knobs), by: d.by, note: d.note || undefined, pinned: !!wb.kernelPins[d.key] })),
    get(i) {
      const d = decisionAt(i), run = wb.run;
      const opts = d.options.map((o, j) => {
        const s = wb.store.statsFor(wb.evidenceId, d.key, o.knobs);
        return { j, row: rowOf(o.knobs), model: r3(modelUs(run, d, o.knobs, wb.device.target)), measured: s ? r3(s.median) : null, ci: s ? [r3(s.lo), r3(s.hi)] : undefined, n: s?.n, chosen: KN.canonical(o.knobs) === KN.canonical(d.knobs || {}) };
      });
      opts.sort((a, b) => (a.model ?? Infinity) - (b.model ?? Infinity));
      return { rule: d.rule, node: d.node, key: String(d.key), by: d.by, note: d.note || undefined, picked: rowOf(d.knobs), tried: d.tried?.map((t) => `${rowOf(t.knobs)}: ${t.reason}`), options: opts.slice(0, 40), more: Math.max(0, opts.length - 40) };
    },
    pin(i, opt) {
      const d = decisionAt(i);
      const o = typeof opt === "number" ? d.options[opt] : d.options.find((x) => rowOf(x.knobs) === opt || KN.canonical(x.knobs) === opt);
      if (!o) throw new Error(`fork ${i} has no option ${opt}; use an index (forks.get(i).options[].j) or a row like "${rowOf(d.options[0]?.knobs)}"`);
      wb.pinKernel(d.key, KN.canonical(o.knobs));
      return afterEdit();
    },
    unpin(i) { wb.pinKernel(decisionAt(i).key, null); return afterEdit(); },
  };
  let params = {
    list: () => [...wb.params.params.values()].map((p) => ({ name: p.name, type: p.type, value: wb.params.get(p.name), pinned: wb.params.isPinned(p.name), ...(p.opts?.min != null ? { min: p.opts.min, max: p.opts.max } : {}), ...(p.type === "enum" ? { values: p.opts.values } : {}), ...(p._help ? { help: p._help } : {}) })),
    set(name, v) { const p = wb.params.param(name); if (!p) throw new Error(`no param ${name}; params: ${[...wb.params.params.keys()].join(", ")}`); wb.setParam(p, v); return afterEdit(); },
    pin(obj) { wb.pin(obj); return afterEdit(); },
    unpin(name) { wb.unpin(name ?? null); return afterEdit(); },
  };
  const needProg = () => { current(); if (!wb.prog) throw new Error(wb.run?.ok ? "this pipeline does not end in GPU kernels" : "the compile failed; see wb.context().compile.error"); return wb.prog; };
  const kern = (name) => { const p = needProg(); const x = p.kernels.find((y) => y.name === name || y.id === name) || (name == null ? p.kernels[0] : null); if (!x) throw new Error(`no kernel ${name}; kernels: ${p.kernels.map((y) => y.name).join(", ")}`); return x; };
  const kernels = {
    list: () => { const m = wb.measures[wb.deviceId]; return needProg().kernels.map((x) => { const r = m?.kernels.find((y) => y.identity === x.identity && y.row === x.row); return { name: x.name, id: x.id, row: x.row, grid: x.K.grid, block: x.K.block, smem: x.K.smemBytes, inputs: x.inShapes.map((s) => s.join("×")), out: x.shape.join("×"), ...(r ? { us: r3(r.us), check: r.check?.ok === false ? "FAIL" : "ok" } : {}) }; }); },
    get: (name) => kern(name),
    source(name, what = "cuda") {
      const x = kern(name);
      if (what === "cuda") return x.cuda;
      if (what === "wgsl") return x.wgsl;
      const lv = { kernel: "kernel", kir: "kernel", tile: "tile", loop: "loop" }[what];
      if (!lv) throw new Error("source(name, 'cuda' | 'wgsl' | 'kernel' | 'tile' | 'loop')");
      return wb.run.at(lv)?.printNode(x.id) ?? `(no ${lv} level)`;
    },
    simulate(name, { device } = {}) {
      const dev = device ? wb.devices.find((d) => d.id === device) : wb.devices.find((d) => d.id === wb.deviceId && d.kind === "sim") || wb.devices[0];
      if (!dev || dev.kind !== "sim") throw new Error("simulate takes a simulated device (sim:rtx5090, sim:h100, …)");
      const r = simulateKernel(kern(name), dev.target);
      return { device: dev.id, ...kernelRec({ name: kern(name).name, row: kern(name).row, us: r.metrics.us, metrics: r.metrics, check: r.check }), simMs: Math.round(r.simMs) };
    },
  };
  let devices = {
    list: () => wb.devices.map((d) => ({ id: d.id, label: d.label, status: d.status, current: d.id === wb.deviceId })),
    current: () => ({ id: wb.device.id, ...wb.device.describe() }),
    async use(id) { if (!wb.devices.some((d) => d.id === id)) throw new Error(`no device ${id}`); await wb.setDevice(id, { quiet: true }); return { device: wb.device.label, status: wb.device.status, ...afterEdit() }; },
  };
  let measure = async ({ device } = {}) => {
    current();
    const dev = device ? wb.devices.find((d) => d.id === device) : wb.device;
    if (!dev) throw new Error(`no device ${device}`);
    const rec = await wb.measure({ device: dev, quiet: true });
    if (!rec) throw new Error(`could not measure on ${dev.label}: ${dev.status}`);
    return { device: rec.deviceName, total: r3(rec.total), kernels: rec.kernels.map(kernelRec) };
  };
  let tune = async ({ strategy = "spmcts", budget = 24 } = {}) => {
    current();
    await wb.tune({ strategy, budget });
    const T = wb.tuning;
    if (!T?.best) return { error: T?.error || "no result" };
    return { best: r3(T.best.us), rows: T.best.rows, programs: T.history.length, firstUs: r3(T.history[0]?.us), compileNow: runSummary(wb.run, wb.prog) };
  };
  let evidence = {
    list: ({ device = wb.evidenceId, all = false } = {}) => {
      const ids = new Set(wb.prog?.kernels.map((x) => x.identity) || []);
      return wb.store.list({ device }).filter((r) => all || ids.has(r.kernel.identity)).map((r) => ({ id: r.id.slice(0, 12), name: r.kernel.name, row: r.kernel.row, us: r3(median(r.timing.samples)), n: r.timing.samples.length, kind: r.timing.kind, status: wb.store.status(r), reasons: r.validity.reasons.length ? r.validity.reasons : undefined, by: r.by }));
    },
    best: (name) => { const x = kern(name); const b = wb.store.best(wb.evidenceId, x.identity); return b ? { row: b.row, us: r3(b.median), ci: [r3(b.lo), r3(b.hi)], n: b.n } : null; },
    clear({ device = wb.evidenceId } = {}) { wb.store.forget({ device }); wb.compile(); return wb.store.size; },
  };
  const checks = {
    e2e: () => { current(); return wb.e2e && (wb.e2e.error ? { error: wb.e2e.error } : wb.e2e.skipped ? { skipped: wb.e2e.skipped } : { ok: wb.e2e.ok, level: wb.e2e.level, outputs: wb.e2e.checks.map((c) => `${c.name}: ${c.ok ? "ok" : c.message}`), custom: wb.e2e.custom.map((c) => `${c.name}: ${c.ok ? "ok" : c.message}`) }); },
    outputs: () => { current(); return wb.outputs ? Object.fromEntries(Object.entries(wb.outputs.got).map(([name, v]) => [name, summarize(v, 200)])) : null; },
  };
  let presets = {
    list: () => wb.presets.map((p) => `${p.id} ${p.title} [${p.group}]`),
    get: (id) => { const p = wb.presets.find((x) => x.id === id); if (!p) throw new Error(`no preset ${id}`); return p.text; },
    async load(id) { await wb.load(id); return contextSummary(); },
    save({ asNew = false } = {}) { const id = wb.savePreset({ asNew }); return { id, title: wb.preset.title }; },
  };
  const chat = {
    table(rows, title) { const list = Array.isArray(rows) ? rows : Object.entries(rows).map(([a, v]) => ({ key: a, value: v })); onPart({ type: "table", title, rows: JSON.parse(JSON.stringify(list.slice(0, 200), (key, v) => (typeof v === "number" ? r3(v) : v))), total: list.length }); return `shown ${Math.min(200, list.length)} rows`; },
    // the frame compiled the script and passes its verdict: script text never runs in this page unless the user opens it
    propose(script, title = "Proposed project", verdict = {}) {
      if (typeof script !== "string") throw new TypeError("chat.propose(script, title) takes the script as a string");
      const errors = (Array.isArray(verdict.errors) ? verdict.errors : []).map(String);
      onPart({ type: "proposal", title: String(title), code: script, ok: verdict.ok === true, errors: errors.slice(0, 3) });
      return verdict.ok === true ? "shown to the user" : { shown: true, errors };
    },
    code(text, title = "", lang = "") { onPart({ type: "code", title, code: String(text), lang }); return "shown"; },
    show(view, sel = {}) { if (!Dock.ALL_VIEWS.includes(view)) throw new Error(`no view "${view}"; views: ${Dock.ALL_VIEWS.join(" ")}`); if (Object.keys(sel).length) wb.select(sel); wb.showView(view); return "ok"; },
    place(view, o = {}) {
      const other = o.beside || o.with;
      if (!Dock.ALL_VIEWS.includes(view)) throw new Error(`no view "${view}"; views: ${Dock.ALL_VIEWS.join(" ")}`);
      if (!Dock.ALL_VIEWS.includes(other)) throw new Error(`name the view to place it by: { beside: "ir", side: "right" } or { with: "ir" }`);
      wb.showView(other);
      const t = Dock.tileOf(wb.layout, other);
      wb.dropView(view, o.beside ? { kind: "side", tile: t.id, side: o.side || "right" } : { kind: "tab", tile: t.id });
      return Dock.ALL_VIEWS.filter((v) => wb.isVisible(v));
    },
  };
  // real hardware behind the Kiln server: the agent proposes, only the user approves (the server enforces it too)
  let jobs = {
    list: () => wb.jobs.slice(0, 20).map((j) => ({ id: j.id, status: j.status, by: j.proposedBy, executor: j.executor, reason: j.reason, kernels: j.kernels.length })),
    async propose({ device, reason } = {}) {
      needProg();
      const dev = device ? wb.devices.find((d) => d.id === device) : wb.device;
      if (!dev?.server) throw new Error(`jobs run on the Kiln server's devices: ${wb.devices.filter((d) => d.server).map((d) => d.id).join(" ") || "none (this page is not served by the Kiln server)"}`);
      const job = await wb.proposeJob(dev, { proposer: "agent", reason: reason == null ? null : String(reason), quiet: true });
      if (!job) throw new Error("the server did not take the job; see the Events view");
      return { id: job.id, status: job.status, note: "it waits for the user to approve it in the Jobs view; its records arrive when it is done" };
    },
  };
  const ref = {
    all: () => REFERENCE,
    section(name) {
      const parts = REFERENCE.split(/\n(?=## )/);
      const p = parts.find((x) => x.split("\n")[0].toLowerCase().includes(String(name).toLowerCase())) || parts.find((x) => x.toLowerCase().includes(String(name).toLowerCase()));
      if (!p) throw new Error(`no section like "${name}"; sections: ${parts.map((x) => x.split("\n")[0]).join(" · ")}`);
      return p;
    },
  };
  if (mode === "readonly") {
    editor = RO(editor, ["set", "edit"], "editor");
    notes = RO(notes, ["set", "edit"], "notes");
    forks = RO(forks, ["pin", "unpin"], "forks");
    params = RO(params, ["set", "pin", "unpin"], "params");
    devices = RO(devices, ["use"], "devices");
    evidence = RO(evidence, ["clear"], "evidence");
    presets = RO(presets, ["load", "save"], "presets");
    jobs = RO(jobs, ["propose"], "jobs");
    tune = () => { throw new ReadOnlyError("tune"); };
    // measuring is allowed, but nothing is recorded
    measure = async ({ device } = {}) => {
      const dev = device ? wb.devices.find((d) => d.id === device) : wb.device;
      if (!dev) throw new Error(`no device ${device}`);
      const res = await measureProgram(needProg(), dev, { store: null });
      return { device: dev.label, total: r3(res.total), kernels: res.kernels.map((x) => kernelRec({ ...x, name: x.kern.name, row: x.kern.row })), recorded: false };
    };
  }
  return { wb: WB, editor, notes, compile, forks, params, kernels, devices, measure, tune, evidence, checks, presets, jobs, chat, ref };
}

export { yaml };

export function conversationMarkdown(conv) {
  return conv.messages.map((m) => (m.role === "user" ? `## You\n\n${m.text}` : `## Agent\n\n${m.text}${steps(m).map((s) => `\n\n\`\`\`js\n${s.code}\n\`\`\`\n\n\`\`\`yaml\n${s.result ?? ""}\n\`\`\``).join("")}`)).join("\n\n");
}

export const SUGGESTIONS = [
  "Walk me through what each pass did to this program, IR by IR.",
  "Why did the compiler pick these schedules? Measure the top 3 alternatives for the slowest kernel.",
  "Add a pass that rewrites x*x into square(x) and show the trace.",
  "Write a fused attention program with a causal mask and tune it.",
  "Make a new project: ",
];
