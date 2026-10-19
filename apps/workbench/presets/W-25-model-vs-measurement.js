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

// Spearman's ρ: Pearson's correlation of the ranks, with tied values given their average rank, so the result does
// not depend on the order the options are listed in (many thread-per-element schedules tie in the model)
const spearman = (a, b) => {
  const rank = (v) => {
    const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = [];
    for (let i = 0; i < o.length; ) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let t = i; t <= j; t++) r[o[t][1]] = (i + j) / 2; i = j + 1; }
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length, ma = (n - 1) / 2;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (ra[i] - ma) * (rb[i] - ma); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - ma) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
};

const { missing, heuristic, derived, combine } = std.evidence;
// One row for both hypotheses: ρ (model vs measured ranks) and the regret of the model's favourite, over every
// schedule measured on this device. ρ involves the model, so it is heuristic; the regret is a ratio of
// measurements, so its class is that of the times (heuristic on the simulator, derived on hardware).
const scored = (ev) => {
  const opts = ev.options("k_softmax_reduce");
  if (opts.length < 3) { const why = `${opts.length} schedule${opts.length === 1 ? "" : "s"} measured on this device: sweep them all`; return { rho: missing(why), regret: missing(why), n: opts.length }; }
  const model = opts.map((o) => +o.model), us = opts.map((o) => +o.time);
  const fav = opts.map((o, i) => i).sort((a, b) => model[a] - model[b] || (k.knobs.canonical(opts[a].knobs) < k.knobs.canonical(opts[b].knobs) ? -1 : 1))[0];
  const prov = combine(...opts.map((o) => o.time));
  return {
    rho: heuristic(spearman(model, us), { method: `Spearman ρ over ${opts.length} measured schedules` }),
    regret: (prov === "heuristic" ? heuristic : derived)(us[fav] / Math.min(...us), { method: `measured time of the model's favourite ${opts[fav].row} over the fastest measured` }),
    n: opts.length,
  };
};

project("model-vs-measurement")
  .params(rows, dim)
  .program(({ x }) => ({ y: N.softmax(x, -1) }), ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  .check("the cost model, scored against this device's measurements", ({ run }) => {
    const { store, deviceId, target } = run.ctx;
    const d = run.decisions.find((x) => x.rule === "schedule");
    // per option, the median of its decisive records on this device (stale, invalid and partial records do not count)
    const measured = store ? d.options.map((o) => ({ knobs: o.knobs, s: store.statsFor(deviceId, d.key, o.knobs) })).filter((o) => o.s) : [];
    if (measured.length < 3) return { ok: true, message: `${measured.length} of ${d.size} options measured on ${deviceId}: sweep them all to score the model` };
    const g = run.at("loop"), n = g.nodes.get(d.node);
    const an = std.tile.analyze(n.attrs.expr, n.attrs.shape, n.args.map((a) => g.nodes.get(a).type.shape));
    const model = measured.map((o) => std.tile.estimate(an, o.knobs, target).us);
    const us = measured.map((o) => o.s.median);
    const row = (i) => std.tile.canonRow(measured[i].knobs);
    // the model's favourite, with the same tie-break the compile uses (lowest score, then knobs in canonical order)
    const order = measured.map((o, i) => i).sort((a, b) => model[a] - model[b] || (k.knobs.canonical(measured[a].knobs) < k.knobs.canonical(measured[b].knobs) ? -1 : 1));
    const iModel = order[0], best = Math.min(...us), iBest = us.indexOf(best);
    return { ok: true, message: `${measured.length} of ${d.size} options measured on ${deviceId} · Spearman ρ = ${spearman(model, us).toFixed(3)} · the model's favourite ${row(iModel)} measured ${us[iModel].toFixed(1)} µs; the best measured ${row(iBest)} ${best.toFixed(1)} µs · regret ${(us[iModel] / best).toFixed(2)}×` };
  })
  // The same score as two claims, judged live against the evidence (Hypotheses view; the cards in the Notes).
  .hypothesis("model-ranks-schedules", (h) => h
    .claim("The cost model orders this kernel's measured schedules as the measurements do: Spearman ρ ≥ 0.9.")
    .predicts(scored, (r) => r.rho >= 0.9)
    .alternatives("Thread-per-element schedules are about 1000× slower than row schedules; such easy pairs alone can make ρ high")
    .scope("the softmax kernel at the current sizes; every schedule measured on the current device"))
  .hypothesis("model-pick-near-best", (h) => h
    .claim("Trusting the cost model costs at most 10 %: its favourite among the measured schedules is within 1.1× of the fastest.")
    .predicts(scored, (r) => r.regret <= 1.1)
    .alternatives("The model assumes the row re-reads hit L2; the simulator sends 60 % of them to DRAM, so on the simulator staging wins")
    .scope("the softmax kernel at the current sizes; every schedule measured on the current device"));
