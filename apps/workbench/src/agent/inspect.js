// The agent's ir and trace namespaces over one compile: `state()` returns { run, graph, project } or throws. They
// run in the sandbox frame over the frame's own compile of the editor's script, so they return live objects and
// accept predicates, neither of which can cross the bridge to the page.
import { typeStr, unifiedDiff, identityOf } from "@kiln/kiln/core/kiln.js";
import { clip, summarize, compare } from "@kiln/kiln/core/util.js";
import { rowOf, r3 } from "./encode.js";

export function inspectScope(state) {
  const levelGraph = (level) => {
    const { run } = state();
    if (level == null) return run.graph;
    const g = level === "final" ? run.graph : run.at(level);
    if (!g) throw new Error(`no IR level "${level}"; levels: ${["input", ...run.irOrder, "final"].join(", ")}`);
    return g;
  };
  const inputs = () => { const { project, graph } = state(); return project.inputsFor(graph); };
  const ir = {
    levels: () => { const { run } = state(); return ["input", ...run.irOrder, ...(run.ok ? [] : ["final"])].map((n) => `${n}: ${(n === "final" ? run.graph : run.at(n)).size} nodes`); },
    text: (level, { bodies = true, types = true, only = null } = {}) => levelGraph(level).print({ body: bodies, types, only }),
    node(id, level) {
      const g = levelGraph(level), n = g.nodes.get(id);
      if (!n) throw new Error(`no node ${id} at ${level || "the final graph"}`);
      return { id, op: n.name, type: typeStr(n.type), attrs: Object.fromEntries(Object.entries(n.attrs).filter(([a]) => !["K", "cuda", "wgsl", "expr"].includes(a)).map(([a, v]) => [a, summarize(v, 120)])), args: n.args.map((a) => g.ref(a)), users: g.users(id), knobs: n.knobs, text: g.printNode(id), identity: String(identityOf(g, id)) };
    },
    find: (op, level) => levelGraph(level).findAll(op).map((v) => v.id),
    graph: (level) => levelGraph(level),
    eval(level, ins) { return levelGraph(level).eval(ins || inputs()); },
    compare(a, b) {
      const ins = inputs(), A = levelGraph(a).eval(ins), B = levelGraph(b).eval(ins);
      return Object.fromEntries(Object.keys(A).map((name) => [name, compare(A[name], B[name], { rtol: 1e-3, atol: 1e-4 }).message || "ok"]));
    },
  };
  const trace = {
    passes: () => { const { run } = state(); return Object.entries(run.passStats).map(([name, s]) => ({ pass: name, short: s.short, rewrites: s.applied, declined: s.skipped, forks: s.forks, ms: r3(s.ms) })); },
    steps({ pass = null, rule = null, node = null, declined = false, limit = 60 } = {}) {
      const { run } = state();
      return run.steps.filter((s) => (declined || s.kind === "rewrite") && (!pass || s.pass === pass || s.short === pass) && (!rule || s.rule === rule) && (!node || s.node === node || s.added?.includes(node) || s.changed?.includes(node)))
        .slice(-limit).map((s) => `#${s.i} ${s.short || s.pass} ${s.rule} @${s.node}${s.kind === "skip" ? " declined: " + clip(s.reason, 160) : ` +${s.added.length} −${s.removed.length} ~${s.changed.length}`}${s.decision ? ` fork(${s.decision.size}) → ${rowOf(s.decision.knobs)} by ${s.decision.by}` : ""}`);
    },
    step(i) {
      const s = state().run.steps[i];
      if (!s) throw new Error(`no step ${i}`);
      return s.kind === "skip" ? { i, pass: s.pass, rule: s.rule, node: s.node, declined: s.reason } : { i, pass: s.pass, rule: s.rule, node: s.node, added: s.added, removed: s.removed, changed: s.changed, diff: unifiedDiff(s.before, s.after).filter((l) => l.op !== " ").map((l) => l.op + " " + l.text).join("\n") };
    },
    why(node) { const { run } = state(); return run.steps.filter((s) => s.node === node || s.added?.includes(node) || s.changed?.includes(node) || s.removed?.includes(node)).map((s) => `#${s.i} ${s.pass}/${s.rule}: ${s.kind === "skip" ? "declined (" + clip(s.reason, 160) + ")" : s.removed.includes(node) ? "removed it" : s.added.includes(node) ? "made it" : "changed it"}`); },
  };
  return { ir, trace };
}
