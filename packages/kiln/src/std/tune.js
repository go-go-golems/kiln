// Autotuning. A search is a loop of compile → measure → record; every measured kernel becomes
// evidence, so the next greedy compile picks it without measuring.
//   spmcts  single-player MCTS over the program's fork tree (max-Q backup, UCB normalized by the
//           best reward so far, retired subtrees, patience), as in the CloudRift post, part 3
//   sweep   per kernel: measure the cost model's top N options
import { k, knobs as KN } from "../core/kiln.js";
import { programOf } from "./program.js";
import { costPrior } from "./tile.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

// replay a path of fork choices, then continue with `rollout`
function replay(path, rollout, sink) {
  let d = 0;
  return { name: "replay", rank(fp, run) {
    const i = d++;
    sink.forks.push({ rule: fp.rule, node: fp.nodeId, size: fp.options.length, key: fp.key });
    if (i < path.length && path[i] < fp.options.length) return { order: [path[i], ...fp.options.map((_, j) => j).filter((j) => j !== path[i])], by: "search" };
    const r = rollout.rank(fp, run);
    return r ? { ...r, by: "search" } : { order: fp.options.map((_, j) => j), by: "search" };
  } };
}

export async function measureProgram(prog, device, { store = null, memo = new Map(), seed = 1, by = "measure", onKernel } = {}) {
  const out = [];
  for (const kn of prog.kernels) {
    const key = kn.identity + "|" + kn.row;
    let res = memo.get(key);
    if (!res) {
      try { res = await device.runKernel(kn, { seed }); } catch (e) { res = { error: e.message || String(e), us: Infinity }; }
      memo.set(key, res);
      store?.record({ device: device.id, kern: kn, result: res, by });
    }
    out.push({ kern: kn, ...res });
    onKernel?.(kn, res);
  }
  const total = out.reduce((a, r) => a + (r.error || r.check?.ok === false ? Infinity : r.us), 0);
  return { kernels: out, total };
}

export async function tune({ pipeline, graph, params, device, store, strategy = "spmcts", budget = 32, patience = 24, c = Math.SQRT2, perKernel = 6, rollout = null, prior = costPrior, onProgress = () => {}, signal = null }) {
  const memo = new Map();
  const history = [];
  let best = null;
  const ctx = { deviceId: device.id };
  rollout ||= pipeline._decide;
  const compile = (decide) => pipeline.with({ target: device.target }).run(graph, { params, decide, ctx });
  const evaluate = async (run, label) => {
    const prog = programOf(run.graph);
    const m = await measureProgram(prog, device, { store, memo, by: "tune" });
    const entry = { i: history.length, us: m.total, rows: prog.kernels.map((kn) => `${kn.name}: ${kn.row}`), label, t: Date.now() };
    history.push(entry);
    if (!best || m.total < best.us) best = { ...entry, decisions: run.decisions.map((d) => ({ rule: d.rule, node: d.node, knobs: d.knobs })) };
    onProgress({ history, best, current: entry });
    return m.total;
  };

  if (strategy === "sweep") {
    // rank each fork's options by the prior (not by evidence: the point is to gather more of it)
    const base = compile(k.decide.chain(k.decide.pinned(), prior, k.decide.first()));
    if (!base.ok) throw base.error;
    await evaluate(base, "prior's pick");
    let fi = 0;
    for (const d of base.decisions) {
      const fork = fi++;
      const ranked = d.options.map((o, j) => ({ ...o, j })).filter((o) => o.score == null || isFinite(o.score)).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, perKernel === Infinity ? undefined : perKernel);
      for (const o of ranked) {
        if (signal?.aborted || history.length >= budget) break;
        let n = 0;
        const pick = { name: "pick", rank: (fp, r) => (n++ === fork ? { order: [o.j], by: "search" } : rollout.rank(fp, r)) };
        await evaluate(compile(pick), `${d.node}: ${KN.canonical(o.knobs)}`);
        await tick();
      }
    }
    return { best, history, strategy };
  }

  // ---------------------------------------------------------------- SP-MCTS
  const root = { visits: 0, best: 0, kids: null, done: false, depth: 0 };
  let globalBest = 0, sinceBest = 0, iter = 0;
  while (history.length < budget && sinceBest < patience && !root.done) {
    if (signal?.aborted) break;
    iter++;
    const path = [], chain = [root];
    let n = root;
    while (n.kids) {
      const live = n.kids.map((ch, j) => [ch, j]).filter(([ch]) => !ch.done);
      if (!live.length) { n.done = true; break; }
      const ucb = ([ch]) => (ch.visits === 0 ? Infinity : ch.best / (globalBest || 1) + c * Math.sqrt(Math.log(n.visits + 1) / ch.visits));
      const [ch, j] = live.reduce((a, b) => (ucb(b) > ucb(a) ? b : a));
      path.push(j); chain.push(ch); n = ch;
    }
    if (n.done) { for (const x of chain.reverse()) x.done = x.kids ? x.kids.every((ch) => ch.done) : x.done; continue; }
    const sink = { forks: [] };
    const run = compile(replay(path, rollout, sink));
    if (!run.ok) { n.done = true; continue; }
    if (sink.forks.length > path.length) n.kids = Array.from({ length: sink.forks[path.length].size }, () => ({ visits: 0, best: 0, kids: null, done: false }));
    else n.done = true;                                   // fully decided: a terminal
    const total = await evaluate(run, path.join("."));
    const reward = isFinite(total) ? 1 / total : 0;
    for (const x of chain) { x.visits++; x.best = Math.max(x.best, reward); }
    if (reward > globalBest) { globalBest = reward; sinceBest = 0; } else sinceBest++;
    for (const x of [...chain].reverse()) if (x.kids && x.kids.every((ch) => ch.done)) x.done = true;
    await tick();
  }
  return { best, history, strategy, iterations: iter, exhausted: root.done };
}
