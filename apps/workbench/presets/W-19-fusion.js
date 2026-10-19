/** W-19 Fusion: why the compiler fuses
 *  group  GPU optimization
 *  about  a transformer epilogue (bias, GELU, scale, residual) with fusion on and off: count the kernels, the DRAM bytes and the microseconds
 *  try    Turn fusion off and explain where the extra time goes, kernel by kernel | How many bytes per element does each version move?
 */
// y = r + s · GELU(x + b): the elementwise tail of a transformer block. Every op reads its inputs from DRAM
// and writes its output back, unless the compiler fuses: then x, b and r are read once, y is written once,
// and every intermediate lives in registers. The FUSE knob switches the fusion pass's rule on and off;
// nothing else changes. See the Notes for the byte counting.
const FUSE = param.bool("fuse", { default: true, help: "run loop fusion (inline producers into consumers)" });
const tokens = param.int("tokens", { min: 256, max: 16384, default: 4096, scale: "log" });
const hidden = param.int("hidden", { min: 256, max: 8192, default: 1024, scale: "log" });

// Wrap the standard fusion rule: same pattern, same guard, but it declines (visibly, in Trace) when FUSE is off.
const merge = std.loop.mergeLoopOps;
const maybeMerge = k.rule("merge_loop_ops (switchable)").match(merge.pat)
  .mutate((ctx) => { if (!ctx.param(FUSE)) ctx.skip("fusion is switched off"); return merge.mut(ctx); });
for (const g of merge.guards) maybeMerge.guard(g);
const fusion = k.pass("loop/fusion").short("f").order("reverse").rules(maybeMerge).describe("fuse loop kernels, unless FUSE is off");

project("fusion")
  .pipeline(std.emmy.pipeline().replace("loop/fusion", fusion).with({ name: "emmy (switchable fusion)" }))
  .params(FUSE, tokens, hidden)
  .program(({ x, r }, { param }) => {
    const b = std.weight("bias", [param(hidden)]);
    return { y: N.add(r, N.mul(N.gelu(N.add(x, b)), 0.5)) };
  }, ({ param }) => { const t = k.tensor([param(tokens), param(hidden)]); return { x: t, r: t }; })
  .check("kernels", ({ run }) => {
    const ks = run.graph.findAll("gpu.kernel").length;
    return { ok: run.params.get(FUSE) ? ks === 1 : ks > 1, message: `${ks} kernel${ks === 1 ? "" : "s"} with fusion ${run.params.get(FUSE) ? "on" : "off"}` };
  });
