// The agent's side of the sandbox (guide §31). Eval code runs here, in a dedicated worker started by an
// <iframe sandbox="allow-scripts"> with an opaque origin and a Content-Security-Policy that refuses every connection:
// it cannot read the page, its storage or its session token, cannot reach the server or any other host, and has no
// document to navigate. The page is reached only through one MessagePort, where every workbench call is a message the
// page checks against the run mode and answers with data. One frame and worker run one eval, so nothing an eval
// leaves behind in this realm reaches the next one.
//
// Local here: Kiln's script names (k, P, std, …), log/console, and everything that needs a live compile — ir, trace
// and editor.check compile the editor's script in this frame with the page's state (params, pins, target, the
// device's evidence), by the same compileScript the page uses.
import { makeScriptScope, Project } from "@kiln/kiln/std/index.js";
import { ParamSet } from "@kiln/kiln/core/kiln.js";
import { summarize } from "@kiln/kiln/core/util.js";
import { EvidenceStore } from "@kiln/kiln/std/store.js";
import { compileScript, endToEnd } from "../compile.js";
import { inspectScope } from "./inspect.js";
import { errs, warns, runSummary, e2eLine, yaml, toWire, fromWire } from "./encode.js";

const hasFunction = (v, depth = 8) => typeof v === "function" || (depth > 0 && v && typeof v === "object" && !ArrayBuffer.isView(v) && Object.values(v).some((x) => hasFunction(x, depth - 1)));

/** Serve one eval over `port`: wait for { t: "eval", code, api, ctx }, run it, post { t: "done", … }. */
export function startFrame(port) {
  let next = 0, started = false;
  const waiting = new Map();
  port.onmessage = (e) => {
    const m = e.data;
    if (m?.t === "ret") {
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m);
      else w.reject(Object.assign(new Error(m.error?.message ?? "failed"), { name: m.error?.name ?? "Error" }));
    } else if (m?.t === "eval" && !started) { started = true; runEval(m, call).then((r) => port.postMessage({ t: "done", ...r })); }
  };
  function call(path, args) {
    return new Promise((resolve, reject) => {
      if (hasFunction(args)) return reject(new TypeError(`${path}: functions cannot be sent to the page; pass data, or use editor.check() and ir for live objects`));
      const id = ++next;
      waiting.set(id, { resolve, reject });
      try { port.postMessage({ t: "call", id, path, args: toWire(args) }); }
      catch (e) { waiting.delete(id); reject(new TypeError(`${path}: its arguments cannot be sent to the page (${e.message})`)); }
    });
  }
}

async function runEval({ code, api, ctx: ctx0 }, call) {
  let ctx = ctx0, local = null;
  const storeOf = (c) => (c._store ??= EvidenceStore.fromSlice(c.store));
  const compileWith = (c, text = c.script, pins = null) => {
    const params = new ParamSet([]);
    for (const [n, v] of c.params.vals) params.vals.set(n, v);
    for (const n of c.params.pins) params.pins.add(n);
    return compileScript(text, { params, kernelPins: c.kernelPins, target: c.target, deviceId: c.deviceId, store: storeOf(c), pins });
  };
  const summary = (r) => ({ ok: r.ok, errors: errs(r.diags), warnings: warns(r.diags), compile: runSummary(r.run, r.prog), check: r.run?.ok ? e2eLine(endToEnd(r.run, r.graph, r.project).e2e) : null });
  // the editor's script as the page would compile it now, once per state of the page
  const state = () => {
    local ??= compileWith(ctx);
    if (!local.run) throw new Error(`the editor's script does not compile: ${errs(local.diags).slice(0, 3).join("; ") || "no program"}`);
    return local;
  };
  const bridged = async (path, args) => {
    const r = await call(path, args);
    if (r.ctx) { ctx = r.ctx; local = null; }
    return fromWire(r.value);
  };

  const scope = {};
  for (const { path } of api) {
    const [ns, fn] = path.split(".");
    const stub = (...args) => bridged(path, args);
    if (fn) (scope[ns] ??= {})[fn] = stub;
    else scope[ns] = stub;
  }
  // a script change the page did not run (the user runs agent-written scripts) is compiled here instead
  const orLocal = (path) => async (...args) => {
    const res = await bridged(path, args);
    return res?.ran === false ? { ...summary(compileWith(ctx)), ran: false, note: res.note } : res;
  };
  scope.editor = {
    ...scope.editor,
    ...(scope.editor?.set ? { set: orLocal("editor.set"), edit: orLocal("editor.edit") } : {}),
    async check(text, { device, pins } = {}) {
      const c = device ? await bridged("__context", [{ device }]) : ctx;
      const r = compileWith(c, text ?? c.script, pins);
      return { ...summary(r), run: r.run, prog: r.prog, graph: r.graph, project: r.project };
    },
  };
  if (scope.compile) scope.compile = orLocal("compile");
  if (scope.chat?.propose) scope.chat.propose = (script, title) => {
    const r = compileWith(ctx, String(script));
    return bridged("chat.propose", [script, title, { ok: r.ok, errors: errs(r.diags).slice(0, 3) }]);
  };
  Object.assign(scope, inspectScope(state));

  const logs = [];
  const fmt = (a) => a.map((x) => (typeof x === "string" ? x : summarize(x, 400))).join(" ");
  const log = (...a) => logs.push(fmt(a));
  const names = { ...makeScriptScope({ projects: [] }), project: (name = "experiment") => new Project(name), ...scope, log, console: { log, info: log, warn: (...a) => log("warn:", ...a), error: (...a) => log("error:", ...a) } };
  const keys = Object.keys(names);
  try {
    const res = await new Function(...keys, `"use strict";\nreturn (async () => {\n${code}\n})();\n//# sourceURL=agent-eval.js`)(...keys.map((n) => names[n]));
    return res === undefined ? { ok: true, out: "# returned undefined", lang: "yaml", logs: logs.join("\n") } : typeof res === "string" ? { ok: true, out: res, lang: "text", logs: logs.join("\n") } : { ok: true, out: yaml(res), lang: "yaml", logs: logs.join("\n") };
  } catch (e) {
    const m = String(e?.stack || "").match(/agent-eval\.js:(\d+)/), line = m ? Math.max(1, +m[1] - 4) : null;
    return { ok: false, out: yaml({ error: `${e?.name ?? "Error"}: ${e?.message ?? e}`, ...(line ? { line } : {}) }), lang: "yaml", logs: logs.join("\n") };
  }
}
