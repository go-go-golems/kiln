/** W-15 Your own cost model
 *  group  Extend the compiler
 *  about  replace the schedule cost model with your own (occupancy first): it maps a matmul one row per block and runs 18× slower
 *  try    Tune, then compare the measured best with what this model picked | Write a model that prefers fewer blocks
 */
// Every schedule fork is ranked by a decide policy. The default chain is: pins → measured evidence →
// std.tile.costPrior (an analytic roofline + occupancy model) → first. Here the model is replaced by one
// that only cares about occupancy, ties broken by threads per block. Knobs shows each option's score
// under "occupancy"; the model column is the standard model, for comparison. It is often wrong:
// occupancy is not speed. Measure and Tune to see by how much.
const { analyze, estimate } = std.tile;
const occupancyFirst = k.decide.cost(({ knobs, node, ctx }) => {
  if (!node.is("loop.kernel")) return null;
  const an = analyze(node.attrs.expr, node.attrs.shape, node.args.map((a) => a.shape));
  const e = estimate(an, knobs, ctx.target);
  if (!isFinite(e.us)) return Infinity;                      // illegal on this device
  return -e.occupancy + (knobs.TPB || knobs.BM * knobs.BN / ((knobs.TM || 1) * (knobs.TN || 1)) || 0) * 1e-6;
}, { name: "occupancy" }).for("schedule");

const pipe = std.emmy.pipeline().with({ decide: k.decide.chain(k.decide.pinned(), k.decide.evidence(), occupancyFirst, k.decide.first()) });

const rows = param.int("rows", { min: 16, max: 8192, default: 2048, scale: "log" });
const dim = param.int("dim", { min: 64, max: 8192, default: 1024, scale: "log" });
project("occupancy")
  .pipeline(pipe)
  .params(rows, dim)
  .program(({ x }, { param }) => {
    const d = param(dim);
    return { y: N.rms_norm(N.gelu(N.linear(x, std.weight("W", [d, d]))), std.weight("w", [d])) };
  }, ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  // an info check: what the standard model thinks of each pick this policy made
  .check("occupancy-first vs the standard model", ({ run }) => {
    const g = run.at("loop"), out = [];
    for (const d of run.decisions) {
      const node = d.node && g.node(d.node) && g.value(d.node);
      if (!node || !node.is("loop.kernel")) continue;
      const an = analyze(node.attrs.expr, node.attrs.shape, node.args.map((a) => a.shape));
      const est = d.options.map((o) => estimate(an, o.knobs, run.ctx.target).us);
      const mine = est[d.options.findIndex((o) => o.label === d.label)], best = Math.min(...est);
      out.push(`${std.tile.canonRow(d.knobs)}: model says ${mine.toFixed(1)} µs, its own favourite ${best.toFixed(1)} µs (${(mine / best).toFixed(1)}×)`);
    }
    return { ok: true, message: out.join(" · ") || "no schedule forks" };
  });
