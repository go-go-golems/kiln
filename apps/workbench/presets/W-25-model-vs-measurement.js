/** W-25 The cost model vs. the measurements
 *  group  GPU optimization
 *  about  measure every schedule the compiler could pick for one kernel, then score the cost model: rank correlation, and how much its pick loses against the best measured
 *  try    Sweep every option, then tell me where the model and the measurements disagree and why | Do the same on WebGPU and compare the correlation
 */
// The greedy compile ranks a fork's options with an analytic cost model (std.tile.estimate) and takes the
// best. Autotuning instead measures. This project's check scores the model against whatever has been
// measured for this kernel on the current device: Spearman's rank correlation ρ between predicted and
// measured times, and the regret (the measured time of the model's favourite ÷ the best measured time).
// Run the sweep from the Notes, read the check in the Code view, then try a real GPU (WebGPU).
const rows = param.int("rows", { min: 64, max: 8192, default: 2048, scale: "log" });
const dim = param.int("dim", { min: 256, max: 8192, default: 8192, scale: "log" });

const spearman = (a, b) => {
  const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], j) => (r[i] = j)); return r; };
  const ra = rank(a), rb = rank(b), n = a.length;
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
};

project("model-vs-measurement")
  .params(rows, dim)
  .program(({ x }) => ({ y: N.softmax(x, -1) }), ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  .check("the cost model, scored against this device's measurements", ({ run }) => {
    const { store, deviceId, target } = run.ctx;
    const d = run.decisions.find((x) => x.rule === "schedule");
    const measured = store ? store.list({ device: deviceId, identity: d.key }).filter((r) => r.ok !== false) : [];
    if (measured.length < 3) return { ok: true, message: `${measured.length} of ${d.size} options measured on ${deviceId}: sweep them all to score the model` };
    const g = run.at("loop"), n = g.nodes.get(d.node);
    const an = std.tile.analyze(n.attrs.expr, n.attrs.shape, n.args.map((a) => g.nodes.get(a).type.shape));
    const model = measured.map((r) => std.tile.estimate(an, r.knobs, target).us);
    const us = measured.map((r) => r.us);
    // the model's favourite, with the same tie-break the compile uses (lowest score, then knobs in canonical order)
    const order = measured.map((r, i) => i).sort((a, b) => model[a] - model[b] || (k.knobs.canonical(measured[a].knobs) < k.knobs.canonical(measured[b].knobs) ? -1 : 1));
    const iModel = order[0], best = Math.min(...us), iBest = us.indexOf(best);
    return { ok: true, message: `${measured.length} of ${d.size} options measured on ${deviceId} · Spearman ρ = ${spearman(model, us).toFixed(3)} · the model's favourite ${measured[iModel].row} measured ${us[iModel].toFixed(1)} µs; the best measured ${measured[iBest].row} ${best.toFixed(1)} µs · regret ${(us[iModel] / best).toFixed(2)}×` };
  });
