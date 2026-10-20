// Autotuning. A search is a loop of compile → measure → record; every measured kernel becomes
// evidence, so the next greedy compile picks it without measuring.
//   spmcts  single-player MCTS over the program's fork tree (max-Q backup, UCB normalized by the
//           best reward so far, retired subtrees, patience), as in the CloudRift post, part 3
//   sweep   per kernel: measure the cost model's top N options
import { k, knobs as KN } from "../core/kiln.js";
import { programOf } from "./program.js";
import { canonRow, costPrior } from "./tile.js";
import { activationOf } from "./records.js";

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

// Measure every kernel of a program and store one record per kernel. A device with a protocol (measureKernels:
// repetitions, seeded order, guide §28) measures the kernels not yet in `memo` in one run, so a repetition contains
// every kernel; other devices run each kernel once (runKernel). `run` and `kernelPins` say what the compile asked
// for, so each record carries its activation check (§27). `onStep(done, total)` reports protocol progress.
export async function measureProgram(prog, device, { store = null, memo = new Map(), seed = 1, by = "measure", onKernel, onStep, run = null, kernelPins = null, context = null } = {}) {
  const keyOf = (kn) => kn.identity + "|" + kn.row;
  const now = new Map();
  if (device.measureKernels) {
    const todo = [...new Map(prog.kernels.filter((kn) => !memo.has(keyOf(kn))).map((kn) => [keyOf(kn), kn])).values()];
    if (todo.length) {
      let results;
      try { results = await device.measureKernels(todo, {}, { onStep }); } catch (e) { results = todo.map(() => ({ error: e.message || String(e), us: Infinity })); }
      todo.forEach((kn, i) => now.set(keyOf(kn), results[i]));
    }
  }
  const out = [];
  for (const kn of prog.kernels) {
    const key = keyOf(kn);
    let res = memo.get(key), record = null;
    if (!res) {
      res = now.get(key);
      if (!res) { try { res = await device.runKernel(kn, { seed }); } catch (e) { res = { error: e.message || String(e), us: Infinity }; } }
      memo.set(key, res);
      if (store) record = store.record({ device, kern: kn, result: res, by, activation: activationOf(kn, { run, kernelPins }), context });
    }
    out.push({ kern: kn, ...res, record });
    onKernel?.(kn, res);
  }
  const total = out.reduce((a, r) => a + (r.error || r.check?.ok === false ? Infinity : r.us), 0);
  return { kernels: out, total };
}

// The policy behind the Knobs view's per-kernel pins: `pins` maps a kernel identity (a fork's key) to a schedule row,
// in short (canonRow) or canonical form. A fork it cannot honour falls through to the next policy, and the record's
// activation check then reports the mismatch.
export function kernelPinPolicy(pins) {
  return { name: "kernel pin", rank: (fp) => {
    const want = pins[fp.key];
    if (!want) return null;
    const i = fp.options.findIndex((o) => canonRow(o.knobs) === want || KN.canonical(o.knobs) === want);
    return i < 0 ? null : { order: [i, ...fp.options.map((_, j) => j).filter((j) => j !== i)], by: "kernel-pin" };
  } };
}

const newPairId = () => globalThis.crypto?.randomUUID?.() ?? `pair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * A paired comparison (guide §28) of one kernel under two or more schedules. Each side compiles the program with
 * the kernel `identity` pinned to its row; the sides' kernels then run in ONE protocol run, so every repetition has
 * a sample of each, in a seeded order, under the same GPU state. Their records share a `pairId`, and ev.ratio uses
 * the paired estimator for them. `pipeline` is the caller's (its own pins and policies stay behind this side's).
 * Throws before measuring when a side's compile cannot honour its row or two sides are one schedule.
 * → { pairId, sides: [{ row, kern, result, record }] }
 */
export async function measurePaired({ pipeline, graph, params, device, store = null, identity, rows, onStep, context = null }) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("measurePaired: give at least two schedule rows");
  const ctx = { deviceId: device.evidenceId ?? device.id, store };
  const sides = rows.map((row) => {
    const pins = { [identity]: row };
    const run = pipeline.with({ target: device.target, decide: k.decide.chain(kernelPinPolicy(pins), pipeline._decide) }).run(graph, { params, ctx });
    if (!run.ok) throw new Error(`compiling with ${row}: ${run.error.message}`);
    const kern = programOf(run.graph).kernels.find((kn) => kn.identity === identity);
    if (!kern) throw new Error(`no kernel with identity ${identity} in the program`);
    const act = activationOf(kern, { run, kernelPins: pins });
    if (!act.ok) throw new Error(`${kern.name}: the compile could not honour ${row} (materialised ${act.materialized})`);
    return { row: kern.row, kern, activation: act };
  });
  const seen = new Set();
  for (const s of sides) { if (seen.has(s.row)) throw new Error(`two sides are the same schedule: ${s.row}`); seen.add(s.row); }
  let results;
  if (device.measureKernels) {
    try { results = await device.measureKernels(sides.map((s) => s.kern), {}, { onStep }); }
    catch (e) { results = sides.map(() => ({ error: e.message || String(e), us: Infinity })); }
  } else {
    results = [];
    for (const [i, s] of sides.entries()) {
      try { results.push(await device.runKernel(s.kern, { seed: 1 })); } catch (e) { results.push({ error: e.message || String(e), us: Infinity }); }
      onStep?.(i + 1, sides.length);
    }
  }
  const pairId = newPairId();
  return {
    pairId,
    sides: sides.map((s, i) => ({ row: s.row, kern: s.kern, result: results[i], record: store ? store.record({ device, kern: s.kern, result: results[i], by: "measure", activation: s.activation, pairId, context }) : null })),
  };
}

export async function tune({ pipeline, graph, params, device, store, strategy = "spmcts", budget = 32, patience = 24, c = Math.SQRT2, perKernel = 6, rollout = null, prior = costPrior, onProgress = () => {}, signal = null, context = null }) {
  const memo = new Map();
  const history = [];
  let best = null;
  const ctx = { deviceId: device.evidenceId ?? device.id };
  rollout ||= pipeline._decide;
  const compile = (decide) => pipeline.with({ target: device.target }).run(graph, { params, decide, ctx });
  const evaluate = async (run, label) => {
    const prog = programOf(run.graph);
    const m = await measureProgram(prog, device, { store, memo, by: "tune", run, context });
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
