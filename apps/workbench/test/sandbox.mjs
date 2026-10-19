// The agent's sandbox in Node (guide §31): the frame's runtime (agent/frame.js) and the page's port server
// (agent/sandbox.js) over a MessageChannel, with the page's real scope. What a browser adds (the opaque origin, the
// CSP, no storage) is checked by agent-e2e.mjs; this file checks the bridge, the run mode, the held script, the eval
// cap, and that the frame compiles the editor's script exactly as the page does.   node build.mjs --gen-only && node test/sandbox.mjs
import { wb } from "../src/ui/wb.js";
import { agent, runEval, apiOf, pageCall, makeAgentScope, revertFrom, steps, EVAL_CAP } from "../src/agent/agent.js";
import { startFrame } from "../src/agent/frame.js";
import { servePort } from "../src/agent/sandbox.js";
import { toWire, fromWire, runSummary } from "../src/agent/encode.js";
import { Tensor } from "@kiln/kiln/core/util.js";

let fails = 0, n = 0;
const check = (ok, msg) => { n++; if (!ok) { fails++; console.log(`FAIL ${msg}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

agent.transport = (opts) => { const ch = new MessageChannel(); startFrame(ch.port2); return servePort(ch.port1, opts).finally(() => ch.port2.close()); };
const msg = (mode = "auto") => ({ role: "assistant", text: "", parts: [], mode });
// run one eval as the agent would; → { ok, result } with the result text the model sees
async function ev(code, m = msg()) { const out = await runEval(code, null, m); return { ok: out.startsWith("ok"), result: out, part: steps(m).at(-1), m }; }
const val = (r) => r.part.result;

await wb.load("W-05");
await wb.setDevice("sim:rtx5090", { quiet: true });
agent.settings.scripts = "hold";

// ---- the bridge: page calls are async and return data; ir and trace are local and take predicates
{
  const r = await ev(`const s = await editor.get(); return s.slice(0, 8);`);
  check(r.ok && val(r) === "/** W-05", `editor.get crosses the bridge: ${val(r)}`);
  const f = await ev(`return (await forks.list()).length;`);
  check(f.ok && +val(f) === wb.run.decisions.length, `forks.list returns data (${val(f)} forks)`);
  const t = await ev(`return ir.text("loop", { only: (x) => x.name === "loop.kernel", bodies: false }).split("\\n").filter((l) => l.includes("loop.kernel")).length;`);
  check(t.ok && +val(t) >= 1, `ir.text takes a predicate in the frame: ${val(t)}`);
  const g = await ev(`const g = ir.graph("loop"); return g.constructor.name + " " + (g.size > 0);`);
  check(g.ok && val(g) === "Graph true", `ir.graph is a live Graph in the frame: ${val(g)}`);
  const fn = await ev(`await params.set("EPS", () => 1);`);
  check(!fn.ok && /functions cannot be sent to the page/.test(val(fn)), "a function argument is refused before it is sent");
  const no = await ev(`return typeof wb.context + " " + typeof wb.summary + " " + typeof window;`);
  check(no.ok && val(no) === "function undefined undefined", `the frame's wb is the bridged namespace, not the Workbench: ${val(no)}`);
}

// ---- pageCall answers listed paths only
{
  const api = apiOf(makeAgentScope({ mode: "auto" }));
  for (const path of ["__proto__", "wb.constructor", "editor.__proto__", "constructor", "ir.text", "editor.check", "toString"]) {
    let refused = false;
    try { await pageCall(api, path, []); } catch (e) { refused = /not part of the workbench API/.test(e.message); }
    check(refused, `pageCall refuses ${path}`);
  }
  check(api.has("jobs.propose") && api.has("editor.set") && !api.has("ir.text") && !api.has("log"), "the API lists page functions only");
}

// ---- the frame compiles as the page does (same forks, same rows, same evidence decisions)
{
  await wb.measure({ quiet: true });
  wb.compile();
  const page = { compile: { ...runSummary(wb.run, wb.prog), ms: 0 }, by: wb.run.decisions.map((d) => d.by) };
  const r = await ev(`const c = await editor.check(); return JSON.stringify({ compile: { ...c.compile, ms: 0 }, by: c.run.decisions.map((d) => d.by) });`);
  check(r.ok && val(r) === JSON.stringify(page), `editor.check in the frame matches the page's compile: ${val(r)}`);
  check(page.by.some((b) => b === "evidence"), `the page decided by evidence after measuring (${page.by})`);
  const h = await ev(`const c = await editor.check(undefined, { device: "sim:h100" }); return c.ok + " " + c.prog.kernels.length;`);
  check(h.ok && /^true \d/.test(val(h)), `editor.check on another device: ${val(h)}`);
}

// ---- a script the agent writes is held, compiled in the frame, and measured only after the user runs it
{
  const run0 = wb.run, script0 = wb.script;
  const edited = script0.replace(/^\/\*\*[^\n]*/, "$& (agent)");
  const r = await ev(`return await editor.set(${JSON.stringify(edited)});`);
  check(r.ok && /ran: false/.test(val(r)) && /ok: true/.test(val(r)) && /compile:/.test(val(r)), "editor.set is held and answered with the frame's compile");
  check(wb.pending && wb.script === edited && wb.run === run0, "the page holds the script and keeps its last compile");
  const m = await ev(`await measure();`);
  check(!m.ok && /HeldScriptError/.test(val(m)), "measure refuses while the script is held");
  const k = await ev(`await kernels.list();`);
  check(!k.ok && /HeldScriptError/.test(val(k)), "kernels refuse while the script is held");
  check(await wb.measure({ quiet: true }) === null, "the page's own Measure refuses too");
  const l = await ev(`return ir.levels().length > 0;`);
  check(l.ok && val(l) === "true", "ir works on the held script");
  const c = await ev(`return (await wb.context()).editor.held != null;`);
  check(c.ok && val(c) === "true", "the context tells the agent its script is held");
  // revert brings back the previous script, not held
  const before = r.m;
  revertFrom(before, steps(before)[0]);
  check(!wb.pending && wb.script === script0 && wb.run !== run0, "revert restores the previous script and recompiles");
  // held again, then run by the user
  await ev(`await editor.set(${JSON.stringify(edited)});`);
  check(wb.pending, "held again");
  check(wb.runScript() === true && !wb.pending && wb.run.ok, "the user's Run compiles it");
  agent.settings.scripts = "run";
  const run1 = wb.run;
  const r2 = await ev(`return await editor.set(${JSON.stringify(script0)});`);
  check(r2.ok && /ran: true/.test(val(r2)) && !wb.pending && wb.run !== run1, "with scripts: run, editor.set runs at once");
  agent.settings.scripts = "hold";
}

// ---- chat.propose: the frame compiles, the page only shows
{
  const compile = wb.compile.bind(wb);
  let compiles = 0;
  wb.compile = (...a) => { compiles++; return compile(...a); };
  const r = await ev(`return await chat.propose("project('x').program(() => { throw new Error('boom'); });", "bad");`);
  wb.compile = compile;
  const part = r.m.parts.find((p) => p.type === "proposal");
  check(r.ok && part && part.ok === false && part.errors.length > 0 && compiles === 0, `chat.propose shows the frame's verdict without compiling in the page (${part?.errors?.[0]})`);
}

// ---- Read-only refuses changes on the page side
{
  const m = msg("readonly");
  for (const code of [`await editor.set("x")`, `await jobs.propose({})`, `await params.set("EPS", 1e-3)`, `await notes.set("x")`, `await tune({ budget: 2 })`]) {
    const r = await ev(code, m);
    check(!r.ok && /ReadOnlyError/.test(val(r)), `read-only refuses: ${code}`);
  }
}

// ---- the eval cap
{
  const m = msg();
  for (let i = 0; i < EVAL_CAP; i++) await ev("return 1;", m);
  const r = await ev("return 1;", m);
  check(!r.ok && /limit is 8 evals per answer/.test(val(r)) && steps(m).length === EVAL_CAP + 1, `eval ${EVAL_CAP + 1} is refused`);
}

// ---- the wire format
{
  const t = fromWire(structuredClone(toWire({ a: new Tensor([2], new Float32Array([1, 2])), m: new Map([["x", 1]]), f: () => 1 })));
  check(t.a instanceof Tensor && same(Array.from(t.a.data), [1, 2]) && t.m.get("x") === 1 && typeof t.f === "string", "a Tensor crosses and is rebuilt; a function becomes its name");
}

console.log(fails ? `${fails} of ${n} sandbox checks FAIL` : `all ${n} sandbox checks pass`);
process.exit(fails ? 1 : 0);
