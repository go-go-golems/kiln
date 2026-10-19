// The workbench's coding agent (after the Octavo Lab architect): one tool, `eval`, whose code runs in
// the page with a scope that reaches the editor, the compiler run (IRs, trace, forks), kernels,
// devices, measurement, tuning and the evidence store. Every step can be reverted (Auto), approved
// first (Ask), or the agent can only look and measure without recording (Read-only).
import * as Dock from "../ui/dock.js";
import { wb, lsGet, lsSet, REFERENCE, GUIDELINES } from "../ui/wb.js";
import { makeScriptScope, Project } from "../std/index.js";
import { k, knobs as KN, typeStr, unifiedDiff, identityOf, Value, Run } from "../core/kiln.js";
import { clip, summarize, fmtUs, compare } from "../core/util.js";
import { canonRow, analyze, estimate } from "../std/tile.js";
import { simulateKernel } from "../std/program.js";
import { measureProgram } from "../std/tune.js";

export const TIER_LABEL = { quick: "Fast", default: "Balanced", complex: "Deep" };
const HISTORY = 16;
const OUT_MAX = 9000;
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
};
const friendly = (e) => ERRORS[e?.code] ?? `Something went wrong (${e?.code ?? e?.message ?? "unknown"}). Try again.`;

// ---------------------------------------------------------------- state
export const agent = { settings: { tier: "default", effort: "medium", mode: "auto", ...lsGet("agentSettings", {}) }, conv: null, busy: false, ctl: null };
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
const errs = (diags) => diags.filter((d) => d.level === "error").map((d) => (d.line ? `line ${d.line}: ` : "") + d.message);
const warns = (diags) => diags.filter((d) => d.level === "warn").map((d) => (d.line ? `line ${d.line}: ` : "") + d.message);
function runSummary(run, prog) {
  if (!run) return null;
  return {
    ok: run.ok, ...(run.ok ? {} : { error: `${run.error.kind}: ${clip(run.error.message, 300)}` }),
    irs: run.irOrder.map((n) => `${n}(${run.at(n).size})`).join(" → "),
    rewrites: run.steps.filter((s) => s.kind === "rewrite").length, declined: run.steps.filter((s) => s.kind === "skip").length, forks: run.decisions.length, ms: Math.round(run.ms),
    ...(prog ? { kernels: prog.kernels.map((x) => `${x.name} [${x.row}]`) } : { outputs: run.graph.outputs.map((o) => `${o.name}: ${o.id} ${typeStr(run.graph.nodes.get(o.id)?.type)}`) }),
  };
}
export function contextSummary() {
  const s = wb.summary();
  const m = wb.measures[wb.deviceId];
  const e = wb.e2e;
  const ctx = {
    preset: wb.preset ? `${wb.preset.id} ${wb.preset.title}${wb.preset.mine ? " (mine)" : ""}` : null,
    editor: { lines: wb.script.split("\n").length, saved: wb.script === wb.savedScript, errors: errs(wb.diags).slice(0, 3), warnings: warns(wb.diags).length },
    notes: { lines: wb.notes ? wb.notes.split("\n").length : 0, saved: wb.notes === wb.savedNotes, sections: (wb.notes.match(/^## .*/gm) || []).map((h) => h.slice(3)).slice(0, 12) },
    compile: runSummary(wb.run, wb.prog),
    check: !e ? null : e.error ? "error: " + clip(e.error, 200) : e.skipped ? "skipped (too large to evaluate)" : e.ok ? `pass (${e.level} IR vs frontend${e.custom.length ? ` + ${e.custom.length} custom` : ""})` : "FAIL: " + [...e.checks, ...e.custom].filter((c) => !c.ok).map((c) => `${c.name}: ${clip(c.message, 120)}`).join("; "),
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

const AGENT_SCOPE = [
  ["wb.context()", "the same summary as the [context] block"],
  ["editor.get() · editor.set(text) · editor.edit(find, replace)", "read or change the project script; set/edit compile it and return {ok, errors, warnings, compile, check}"],
  ["notes.get() · notes.set(markdown) · notes.edit(find, replace) · notes.section(title)", "the project's notes (the Notes view): a Markdown tutorial with $TeX$, $$display math$$, tables, > **Try** call-outs and lab: links that drive the workbench (lab:param?name=n&value=v, lab:pin?TPB=128, lab:measure, lab:device?id=sim:h100, lab:tune?budget=16, lab:view?name=perf)"],
  ["editor.check(text?, { device, pins })", "compile a script in isolation (nothing changes): {ok, errors, warnings, compile, run, prog} — run and prog are live objects to inspect"],
  ["compile()", "recompile the editor's script now; returns the compile summary"],
  ["ir.levels() · ir.text(level, { bodies, types, only }) · ir.node(id, level?) · ir.find(op, level?) · ir.graph(level?)", "IR checkpoints (input, torch, tensor, loop, tile, kernel, gpu …); `only` is a predicate n => bool; ir.graph returns a kiln Graph"],
  ["ir.eval(level?, inputs?) · ir.compare(levelA, levelB)", "interpret an IR level on the project's inputs; compare two levels' outputs"],
  ["trace.passes() · trace.steps({ pass, rule, node, declined, limit }) · trace.step(i) · trace.why(node)", "what each pass did; one step with its diff; every rule that touched or declined a node"],
  ["forks.list() · forks.get(i) · forks.pin(i, optionIndex | row) · forks.unpin(i)", "decisions with every option's model and measured time; pinning fixes one kernel's schedule (by its identity)"],
  ["params.list() · params.set(name, value) · params.pin({ name: value }) · params.unpin(name?)", "program sliders, pipeline params and global knob pins (MAP, TPB, …)"],
  ["kernels.list() · kernels.get(name) · kernels.source(name, 'cuda' | 'wgsl' | 'kernel' | 'tile' | 'loop') · kernels.simulate(name, { device })", "the compiled kernels; simulate runs one on a simulated GPU without recording"],
  ["devices.list() · devices.current() · await devices.use(id)", "sim:rtx5090 sim:rtx4090 sim:h100 sim:a100 sim:orin webgpu cuda"],
  ["await measure({ device }) · await tune({ strategy: 'spmcts' | 'sweep', budget })", "run every kernel (time, metrics, sampled check vs the reference; records evidence) · search schedules"],
  ["evidence.list({ device, all }) · evidence.best(name) · evidence.clear({ device })", "the measured rows the compiler decides by"],
  ["checks.e2e() · checks.outputs()", "the end-to-end check (last evaluable IR vs the frontend) and the output values"],
  ["presets.list() · presets.get(id) · await presets.load(id) · presets.save({ asNew })", "presets; saving keeps them in this browser as U-NN"],
  ["chat.table(rows, title) · chat.propose(script, title) · chat.code(text, title, lang) · chat.show(view, sel) · chat.place(view, { beside | with, side })", "evidence in the chat; bring a view forward (views: code agent reference ir graph trace kernels perf knobs tune devices events) and select {ir, node, step, kernel, decision}"],
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

You have exactly one tool, eval. Its code runs in the page as the body of an async function (use await; finish with \`return value\`). In scope:
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
    msg.error = "Claude is not available in this view. Open the workbench in Claude to use the agent. The editor, compiler, simulator and tuner all work by hand.";
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
  description: "Run JavaScript in the workbench page as the body of an async function. Scope: wb, editor, notes, compile, ir, trace, forks, params, kernels, devices, measure, tune, evidence, checks, presets, chat, ref, log, console and the kiln/std names (k, P, std, N, T, nn, tensor, Tensor, ix, E, KB, kx, project, param). Returns \"ok\" plus a YAML summary of the returned value (a string comes back verbatim) and captured logs, cut near 9,000 characters; or \"error\" with the message and line.",
  inputSchema: { type: "object", properties: { code: { type: "string", description: "JavaScript statements; use await; end with return <small value>" } }, required: ["code"] },
  execute: (input, c) => runEval(String(input?.code ?? ""), c?.signal, msg),
});

export async function runEval(code, signal, msg) {
  const part = { type: "tool", code, status: "run", at: msg.text.length, t0: now() };
  msg.parts.push(part);
  paint();
  const mode = msg.mode ?? agent.settings.mode;
  if (mode === "ask" && !msg.approveAll) {
    const d = await askApproval(part, signal);
    if (d === "deny") return finish(part, false, yaml({ declined: true }), "", "The user declined this step.");
    if (d === "all") msg.approveAll = true;
  }
  if (mode !== "readonly") SNAPS.set(part, snapshot());
  const logs = [];
  const scope = makeAgentScope({ mode, onPart: (p) => { msg.parts.push({ ...p, at: msg.text.length }); paint(); }, log: (s) => logs.push(String(s)) });
  const names = Object.keys(scope);
  let ok = true, out, lang = "yaml";
  try {
    const res = await new Function(...names, `"use strict";\nreturn (async () => {\n${code}\n})();\n//# sourceURL=agent-eval.js`)(...names.map((n) => scope[n]));
    if (res === undefined) out = "# returned undefined";
    else if (typeof res === "string") { out = res; lang = "text"; }
    else out = yaml(res);
  } catch (e) {
    ok = false;
    const line = evalLine(e);
    out = yaml({ error: `${e?.name ?? "Error"}: ${e?.message ?? e}`, ...(line ? { line } : {}) });
  }
  wb.bump("code", "compile", "sel", "ui", "measure", "store");
  if (signal?.aborted) { finish(part, ok, out, logs.join("\n"), null, lang); throw new Error("stopped"); }
  return finish(part, ok, out, logs.join("\n"), null, lang);
}
function evalLine(e) {
  const m = String(e?.stack || "").match(/agent-eval\.js:(\d+)/);
  return m ? Math.max(1, +m[1] - 4) : null;
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
    params: wb.params.clone(), kernelPins: { ...wb.kernelPins }, deviceId: wb.deviceId, evidence: JSON.stringify(wb.store.toJSON()),
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
  wb.store.clear(); wb.store.import(JSON.parse(snap.evidence));
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
const RO = (obj, keys, label) => { const o = { ...obj }; for (const key of keys) o[key] = () => { throw new ReadOnlyError(`${label}.${key}`); }; return o; };

const modelUs = (run, d, knobs, target) => {
  const g = run.at("loop"), n = g?.nodes.get(d.node);
  if (!n || n.name !== "loop.kernel") return null;
  try { return estimate(analyze(n.attrs.expr, n.attrs.shape, n.args.map((a) => g.nodes.get(a).type.shape)), knobs, target).us; } catch { return null; }
};
const rowOf = (knobs) => (knobs && "MAP" in knobs ? canonRow(knobs) : KN.canonical(knobs || {}) || "(original)");
const r3 = (x) => (x == null || !isFinite(x) ? x : +x.toPrecision(3));
function kernelRec(x) {
  const mt = x.metrics || {};
  return {
    name: x.name, us: r3(x.us), row: x.row, ...(x.error ? { error: x.error } : {}), check: x.check ? (x.check.ok ? "ok" : x.check.message) : null,
    ...(mt.bound ? { bound: mt.bound, occupancy: r3(mt.occupancy), limiter: mt.limiter } : {}), ...(mt.gbs != null ? { GBs: r3(mt.gbs) } : {}), ...(mt.gflops != null ? { GFLOPs: r3(mt.gflops) } : {}),
    ...(mt.ldSectorsPerReq ? { ldSectorsPerReq: r3(mt.ldSectorsPerReq) } : {}), ...(mt.bankConflicts ? { bankConflicts: r3(mt.bankConflicts) } : {}), ...(mt.divergence ? { divergence: r3(mt.divergence) } : {}),
    ...(mt.parts ? { parts: Object.fromEntries(Object.entries(mt.parts).map(([a, b]) => [a, r3(b)])) } : {}),
  };
}

export function makeAgentScope({ mode = "auto", onPart = () => {}, log = () => {} } = {}) {
  const needRun = () => { if (!wb.run) throw new Error("nothing is compiled; fix the script (editor.get(), wb.context().editor.errors) first"); return wb.run; };
  const levelGraph = (level) => {
    const run = needRun();
    if (level == null) return run.graph;
    const g = level === "final" ? run.graph : run.at(level);
    if (!g) throw new Error(`no IR level "${level}"; levels: ${["input", ...run.irOrder, "final"].join(", ")}`);
    return g;
  };
  const afterEdit = () => ({ ok: !!wb.run?.ok && !errs(wb.diags).length, errors: errs(wb.diags), warnings: warns(wb.diags), compile: runSummary(wb.run, wb.prog), check: contextSummary().check });
  const WB = { context: () => contextSummary() };
  let editor = {
    get: () => wb.script,
    set(text) {
      if (typeof text !== "string") throw new TypeError("editor.set(text) takes the whole script as a string");
      wb.script = text; wb.bump("code"); wb.compile();
      return afterEdit();
    },
    edit(find, replace) {
      const s = wb.script, i = s.indexOf(find);
      if (i < 0) throw new Error("editor.edit: the text to find is not in the editor (copy it exactly from editor.get())");
      if (s.indexOf(find, i + 1) >= 0) throw new Error("editor.edit: the text to find occurs more than once; include more context");
      return editor.set(s.slice(0, i) + replace + s.slice(i + find.length));
    },
    check(text = wb.script, { device, pins } = {}) {
      const dev = device ? wb.devices.find((d) => d.id === device) : wb.device;
      if (!dev) throw new Error(`no device ${device}`);
      const r = wb.tryCompile(text, { device: dev, pins });
      return { ok: r.ok, errors: errs(r.diags), warnings: warns(r.diags), compile: runSummary(r.run, r.prog), run: r.run, prog: r.prog, graph: r.graph, project: r.project };
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
  const ir = {
    levels: () => { const run = needRun(); return ["input", ...run.irOrder, ...(run.ok ? [] : ["final"])].map((n) => `${n}: ${(n === "final" ? run.graph : run.at(n)).size} nodes`); },
    text: (level, { bodies = true, types = true, only = null } = {}) => levelGraph(level).print({ body: bodies, types, only }),
    node(id, level) {
      const g = levelGraph(level), n = g.nodes.get(id);
      if (!n) throw new Error(`no node ${id} at ${level || "the final graph"}`);
      return { id, op: n.name, type: typeStr(n.type), attrs: Object.fromEntries(Object.entries(n.attrs).filter(([a]) => !["K", "cuda", "wgsl", "expr"].includes(a)).map(([a, v]) => [a, summarize(v, 120)])), args: n.args.map((a) => g.ref(a)), users: g.users(id), knobs: n.knobs, text: g.printNode(id), identity: String(identityOf(g, id)) };
    },
    find: (op, level) => levelGraph(level).findAll(op).map((v) => v.id),
    graph: (level) => levelGraph(level),
    eval(level, inputs) { const g = levelGraph(level); return g.eval(inputs || wb.project.inputsFor(wb.graph)); },
    compare(a, b) {
      const ins = wb.project.inputsFor(wb.graph);
      const A = levelGraph(a).eval(ins), B = levelGraph(b).eval(ins);
      return Object.fromEntries(Object.keys(A).map((name) => [name, compare(A[name], B[name], { rtol: 1e-3, atol: 1e-4 }).message || "ok"]));
    },
  };
  const trace = {
    passes: () => { const run = needRun(); return Object.entries(run.passStats).map(([name, s]) => ({ pass: name, short: s.short, rewrites: s.applied, declined: s.skipped, forks: s.forks, ms: r3(s.ms) })); },
    steps({ pass = null, rule = null, node = null, declined = false, limit = 60 } = {}) {
      const run = needRun();
      return run.steps.filter((s) => (declined || s.kind === "rewrite") && (!pass || s.pass === pass || s.short === pass) && (!rule || s.rule === rule) && (!node || s.node === node || s.added?.includes(node) || s.changed?.includes(node)))
        .slice(-limit).map((s) => `#${s.i} ${s.short || s.pass} ${s.rule} @${s.node}${s.kind === "skip" ? " declined: " + clip(s.reason, 160) : ` +${s.added.length} −${s.removed.length} ~${s.changed.length}`}${s.decision ? ` fork(${s.decision.size}) → ${rowOf(s.decision.knobs)} by ${s.decision.by}` : ""}`);
    },
    step(i) {
      const s = needRun().steps[i];
      if (!s) throw new Error(`no step ${i}`);
      return s.kind === "skip" ? { i, pass: s.pass, rule: s.rule, node: s.node, declined: s.reason } : { i, pass: s.pass, rule: s.rule, node: s.node, added: s.added, removed: s.removed, changed: s.changed, diff: unifiedDiff(s.before, s.after).filter((l) => l.op !== " ").map((l) => l.op + " " + l.text).join("\n") };
    },
    why(node) { const run = needRun(); return run.steps.filter((s) => s.node === node || s.added?.includes(node) || s.changed?.includes(node) || s.removed?.includes(node)).map((s) => `#${s.i} ${s.pass}/${s.rule}: ${s.kind === "skip" ? "declined (" + clip(s.reason, 160) + ")" : s.removed.includes(node) ? "removed it" : s.added.includes(node) ? "made it" : "changed it"}`); },
  };
  const decisionAt = (i) => { const d = needRun().decisions[i]; if (!d) throw new Error(`no fork ${i}; there are ${wb.run.decisions.length}`); return d; };
  let forks = {
    list: () => needRun().decisions.map((d, i) => ({ i, rule: d.rule, node: d.node, kernel: wb.prog?.kernels.find((x) => x.identity === d.key)?.name, options: d.size, picked: d.failed ? "none legal" : rowOf(d.knobs), by: d.by, pinned: !!wb.kernelPins[d.key] })),
    get(i) {
      const d = decisionAt(i), run = wb.run;
      const meas = new Map(wb.store.list({ device: wb.deviceId, identity: d.key }).map((r) => [KN.canonical(r.knobs), r]));
      const opts = d.options.map((o, j) => ({ j, row: rowOf(o.knobs), model: r3(modelUs(run, d, o.knobs, wb.device.target)), measured: r3(meas.get(KN.canonical(o.knobs))?.us), chosen: KN.canonical(o.knobs) === KN.canonical(d.knobs || {}) }));
      opts.sort((a, b) => (a.model ?? Infinity) - (b.model ?? Infinity));
      return { rule: d.rule, node: d.node, key: String(d.key), by: d.by, picked: rowOf(d.knobs), tried: d.tried?.map((t) => `${rowOf(t.knobs)}: ${t.reason}`), options: opts.slice(0, 40), more: Math.max(0, opts.length - 40) };
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
  const needProg = () => { if (!wb.prog) throw new Error(wb.run?.ok ? "this pipeline does not end in GPU kernels" : "the compile failed; see wb.context().compile.error"); return wb.prog; };
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
    async use(id) { if (!wb.devices.some((d) => d.id === id)) throw new Error(`no device ${id}`); await wb.setDevice(id, { quiet: true }); return { device: wb.device.label, status: wb.device.status, compile: runSummary(wb.run, wb.prog) }; },
  };
  let measure = async ({ device } = {}) => {
    const dev = device ? wb.devices.find((d) => d.id === device) : wb.device;
    if (!dev) throw new Error(`no device ${device}`);
    const rec = await wb.measure({ device: dev, quiet: true });
    if (!rec) throw new Error(`could not measure on ${dev.label}: ${dev.status}`);
    return { device: rec.deviceName, total: r3(rec.total), kernels: rec.kernels.map(kernelRec) };
  };
  let tune = async ({ strategy = "spmcts", budget = 24 } = {}) => {
    await wb.tune({ strategy, budget });
    const T = wb.tuning;
    if (!T?.best) return { error: T?.error || "no result" };
    return { best: r3(T.best.us), rows: T.best.rows, programs: T.history.length, firstUs: r3(T.history[0]?.us), compileNow: runSummary(wb.run, wb.prog) };
  };
  let evidence = {
    list: ({ device = wb.deviceId, all = false } = {}) => { const ids = new Set(wb.prog?.kernels.map((x) => x.identity) || []); return wb.store.list({ device }).filter((r) => all || ids.has(r.identity)).map((r) => ({ name: r.name, row: r.row, us: r3(r.us), by: r.by, ok: r.ok !== false })); },
    best: (name) => { const x = kern(name); const b = wb.store.best(wb.deviceId, x.identity); return b ? { row: b.row, us: r3(b.us), by: b.by } : null; },
    clear({ device = wb.deviceId } = {}) { wb.store.clear({ device }); wb.compile(); return wb.store.size; },
  };
  const checks = {
    e2e: () => wb.e2e && (wb.e2e.error ? { error: wb.e2e.error } : wb.e2e.skipped ? { skipped: wb.e2e.skipped } : { ok: wb.e2e.ok, level: wb.e2e.level, outputs: wb.e2e.checks.map((c) => `${c.name}: ${c.ok ? "ok" : c.message}`), custom: wb.e2e.custom.map((c) => `${c.name}: ${c.ok ? "ok" : c.message}`) }),
    outputs: () => wb.outputs ? Object.fromEntries(Object.entries(wb.outputs.got).map(([name, v]) => [name, summarize(v, 200)])) : null,
  };
  let presets = {
    list: () => wb.presets.map((p) => `${p.id} ${p.title} [${p.group}]`),
    get: (id) => { const p = wb.presets.find((x) => x.id === id); if (!p) throw new Error(`no preset ${id}`); return p.text; },
    async load(id) { await wb.load(id); return contextSummary(); },
    save({ asNew = false } = {}) { const id = wb.savePreset({ asNew }); return { id, title: wb.preset.title }; },
  };
  const chat = {
    table(rows, title) { const list = Array.isArray(rows) ? rows : Object.entries(rows).map(([a, v]) => ({ key: a, value: v })); onPart({ type: "table", title, rows: JSON.parse(JSON.stringify(list.slice(0, 200), (key, v) => (typeof v === "number" ? r3(v) : v))), total: list.length }); return `shown ${Math.min(200, list.length)} rows`; },
    propose(script, title = "Proposed project") { const r = wb.tryCompile(script); onPart({ type: "proposal", title, code: script, ok: r.ok, errors: errs(r.diags).slice(0, 3) }); return r.ok ? "shown to the user" : { shown: true, errors: errs(r.diags) }; },
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
    tune = () => { throw new ReadOnlyError("tune"); };
    // measuring is allowed, but nothing is recorded
    measure = async ({ device } = {}) => {
      const dev = device ? wb.devices.find((d) => d.id === device) : wb.device;
      const res = await measureProgram(needProg(), dev, { store: null });
      return { device: dev.label, total: r3(res.total), kernels: res.kernels.map((x) => kernelRec({ ...x, name: x.kern.name, row: x.kern.row })), recorded: false };
    };
  }
  const fmtArgs = (a) => a.map((x) => (typeof x === "string" ? x : summarize(x, 400))).join(" ");
  const consoleObj = { log: (...a) => log(fmtArgs(a)), info: (...a) => log(fmtArgs(a)), warn: (...a) => log("warn: " + fmtArgs(a)), error: (...a) => log("error: " + fmtArgs(a)) };
  const scriptScope = makeScriptScope({ projects: [] });
  return {
    ...scriptScope, project: (name = "experiment") => new Project(name),
    wb: WB, editor, notes, compile, ir, trace, forks, params, kernels, devices, measure, tune, evidence, checks, presets, chat, ref,
    log: (...a) => log(fmtArgs(a)), console: consoleObj,
  };
}

// ---------------------------------------------------------------- YAML for results
function plain(v, depth = 6, seen = new WeakSet()) {
  if (v == null || typeof v === "number" || typeof v === "boolean" || typeof v === "string") return typeof v === "number" && !Number.isInteger(v) ? +v.toPrecision(6) : v;
  if (typeof v === "bigint") return String(v);
  if (typeof v === "function") return `[function ${v.name || ""}]`.replace(" ]", "]");
  if (typeof v !== "object") return String(v);
  if (seen.has(v)) return "[circular]";
  if (depth <= 0) return Array.isArray(v) ? `[${v.length} items]` : "{…}";
  seen.add(v);
  if (v instanceof k.Graph) return { graph: v.name, nodes: v.size, ops: v.summary(), outputs: v.outputs.map((o) => o.name + ": " + o.id) };
  if (v instanceof k.Tensor) return { tensor: v.shape.join("×") || "scalar", preview: Array.from(v.preview(8)).map((x) => +x.toPrecision(5)) };
  if (v instanceof Run) return runSummary(v, null);
  if (v instanceof Value) return { value: v.id, op: v.opName, type: typeStr(v.type) };
  if (v instanceof Map) return Object.fromEntries([...v.entries()].slice(0, 100).map(([a, x]) => [String(a), plain(x, depth - 1, seen)]));
  if (v instanceof Set) return [...v].slice(0, 100).map((x) => plain(x, depth - 1, seen));
  if (v instanceof Error) return { error: `${v.name}: ${v.message}` };
  if (ArrayBuffer.isView(v)) return v.length <= 16 ? Array.from(v, (x) => +Number(x).toPrecision(5)) : `[${v.constructor.name} ${v.length}: ${Array.from(v.slice(0, 6), (x) => +Number(x).toPrecision(4)).join(", ")}, …]`;
  if (Array.isArray(v)) { const a = v.slice(0, 200).map((x) => plain(x, depth - 1, seen)); if (v.length > 200) a.push(`… ${v.length - 200} more`); return a; }
  const o = {};
  for (const key of Object.keys(v).slice(0, 120)) o[key] = plain(v[key], depth - 1, seen);
  return o;
}
function scalar(v) {
  if (v == null) return "null";
  if (typeof v === "string") return /^[\w./@#:+-][\w ./@#:+,()%=×-]*$/.test(v) && !/^(true|false|null|yes|no|[\d.+-]+)$/i.test(v) && !/[:#]\s|\s$/.test(v) ? v : JSON.stringify(v);
  return String(v);
}
function toYAML(v, indent = 0) {
  const pad = " ".repeat(indent);
  if (v == null || typeof v !== "object") {
    if (typeof v === "string" && v.includes("\n")) return "|\n" + v.split("\n").map((l) => pad + "  " + l).join("\n");
    return scalar(v);
  }
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    if (v.every((x) => x === null || typeof x !== "object") && v.map(scalar).join(", ").length < 80 && !v.some((x) => typeof x === "string" && x.includes("\n"))) return `[${v.map(scalar).join(", ")}]`;
    return "\n" + v.map((x) => {
      if (x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length) { const body = toYAML(x, indent + 2).replace(/^\n/, ""); return pad + "- " + body.slice(indent + 2); }
      return pad + "- " + toYAML(x, indent + 2);
    }).join("\n");
  }
  const keys = Object.keys(v);
  if (!keys.length) return "{}";
  return "\n" + keys.map((key) => { const kk = /^[\w$.#@-]+$/.test(key) ? key : JSON.stringify(key); const val = toYAML(v[key], indent + 2); return `${pad}${kk}:${val.startsWith("\n") ? val : " " + val}`; }).join("\n");
}
export const yaml = (v) => toYAML(plain(v)).replace(/^\n/, "");

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
