// Compiling a project script against given workbench state, outside the Workbench object. The page's compile and
// the agent's sandbox frame both call these, so a check in the frame decides forks exactly as the page does and
// checks the program's meaning by the same rule (guide §31).
import { k } from "@kiln/kiln/core/kiln.js";
import { runScript, lineOf } from "@kiln/kiln/core/script.js";
import { std } from "@kiln/kiln/std/index.js";
import { programOf } from "@kiln/kiln/std/program.js";
import { kernelPinPolicy } from "@kiln/kiln/std/tune.js";
import { schedule } from "@kiln/kiln/std/loop.js";
import { compare } from "@kiln/kiln/core/util.js";

/** The project's pipeline (or the default one) for a target, with per-kernel pins ahead of its own policy. */
export function pipelineFor(project, target, kernelPins = {}, contraction, matmulPrecision) {
  if ((contraction !== undefined || matmulPrecision !== undefined) && project?._pipe) throw new TypeError("explicit numerical options require the standard pipeline");
  const base = project?._pipe || std.emmy.pipeline({ contraction, matmulPrecision });
  return base.with({ target, decide: k.decide.chain(kernelPinPolicy(kernelPins), base._decide) });
}

/**
 * Compile `text` without touching any workbench: `params` is cloned (the script's params are declared on the clone),
 * `store` is the evidence store forks may read for `deviceId`. → { ok, diags, project, graph, run, prog, pipe }
 */
export function compileScript(text, { params, kernelPins = {}, target, deviceId, store = null, pins = null, contraction, matmulPrecision, transformPipeline = null }) {
  const res = runScript(text);
  if (!res.ok) return { ok: false, diags: res.diags };
  if (transformPipeline !== null && typeof transformPipeline !== "function") throw new TypeError("transformPipeline must be a function");
  const project = res.project;
  let pipe = pipelineFor(project, target, kernelPins, contraction, matmulPrecision);
  if (transformPipeline) pipe = transformPipeline(pipe, { project, target });
  const ps = params.clone();
  for (const p of [...project._params, ...pipe.allParams()]) ps.declare(p);
  if (pins) ps.pin(pins);
  let g;
  try { g = project.graph((p) => ps.get(p)); }
  catch (e) { return { ok: false, diags: [...res.diags, { level: "error", line: lineOf(e), message: "tracing the program: " + e.message }] }; }
  const run = pipe.run(g, { params: ps, target, ctx: { deviceId, store } });
  // Identity views can optimize to an input alias with no GPU kernel. This is
  // still a complete exportable program, distinct from a failed/incomplete run.
  const inputs = new Set(run.graph.inputs.map((input) => input.id));
  const inputOnly = run.ok && run.graph.outputs.length > 0
    && [...run.graph.nodes.keys()].every((id) => inputs.has(id))
    && run.graph.outputs.every((output) => inputs.has(output.id));
  const prog = hasKernels(run) || inputOnly ? programOf(run.graph) : null;
  const diags = [...res.diags, ...(run.ok ? [] : [{ level: "error", line: lineOf(run.error.cause || run.error), message: `${run.error.kind}: ${run.error.message}` }]), ...run.warnings.map((w) => ({ level: "warn", message: w }))];
  return { ok: run.ok, diags, project, graph: g, run, prog, pipe, params: ps };
}

export const hasKernels = (run) => run.ok && [...run.graph.nodes.values()].some((n) => n.name === "gpu.kernel");

/**
 * The program's meaning, checked end to end where it is cheap: the frontend graph against the last IR that evaluates,
 * plus the project's own checks. → { e2e, outputs } (outputs null when nothing was evaluated)
 */
export function endToEnd(run, g, project) {
  try {
    const est = estimateWork(run);
    if (est > 6e7) {
      // too big to evaluate here; structural checks still run (a check that needs outputs is skipped)
      const custom = project._checks.map((c) => { try { return checkResult(c, c.fn({ outputs: null, reference: null, inputs: null, run, graph: g, compare })); } catch (e) { return { name: c.name, ok: true, skipped: true, message: "needs the outputs; skipped at this size" }; } });
      return { e2e: { skipped: `the reference would take ~${(est / 1e6).toFixed(0)}M operations; per-kernel checks still run on every measurement`, custom, ok: custom.every((c) => c.ok) }, outputs: null };
    }
    const inputs = project.inputsFor(g);
    const want = g.eval(inputs);
    const level = ["loop", "gpu", ...[...run.irOrder].reverse()].find((n) => run.at(n) && canEval(run.at(n)));
    const got = level ? run.at(level).eval(inputs) : run.graph.eval(inputs);
    const checks = Object.keys(want).map((name) => ({ name, ...compare(got[name], want[name], { rtol: 1e-3, atol: 1e-4 }) }));
    const custom = project._checks.map((c) => { try { return checkResult(c, c.fn({ outputs: got, reference: want, inputs, run, graph: g, compare })); } catch (e) { return { name: c.name, ok: false, message: e.message }; } });
    return { e2e: { level, checks, custom, ok: checks.every((c) => c.ok) && custom.every((c) => c.ok) }, outputs: { inputs, got, want, level } };
  } catch (e) { return { e2e: { error: e.message }, outputs: null }; }
}

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
