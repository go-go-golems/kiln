/** W-14 Your own pass in the ML pipeline
 *  group  Extend the compiler
 *  about  a Tensor-IR rewrite (divide by a row value → multiply by its reciprocal), offered as a fork and inserted into the standard pipeline
 *  try    Pin RECIP=false and diff the CUDA | Make the pass also handle division by a scalar constant
 */
// Softmax ends with e / Σe, where Σe is one value per row broadcast along the row. Division costs ~4× a
// multiply, and the compiler does one per element. Rewrite it to e · (1/Σe): after fusion, loop-invariant
// code motion computes 1/Σe once per row. The rewrite is a FORK (k.fork.toggle) with the knob RECIP, so
// the original stays available: pin it in Knobs, or let Tune measure both.
const { tensor: Tn } = std.emmy.dialects;
const RECIP = param.bool("RECIP", { off: false, help: "divide by a broadcast value → multiply by its reciprocal" });
const numel = (s) => s.reduce((a, b) => a * b, 1);

const hoistRecip = k.rule("hoist_reciprocal")
  .match(P.op("tensor.ew").as("n").where(({ n }) => n.attrs.fn === "div" && n.arg(1).is(Tn.view) && numel(n.arg(1).arg(0).shape) < numel(n.shape)))
  .rewrite(({ n }) => k.fork.toggle(RECIP, () => {
    const v = n.arg(1);                                     // the broadcast: view(Σe) to the row's shape
    const r = T.ew("recip", v.arg(0));                      // 1/Σe at its own (smaller) shape
    return T.ew("mul", n.arg(0), Tn.view(r, { shape: v.attrs.shape, map: v.attrs.map }));
  }));

const recipPass = k.pass("frontend/reciprocal").short("r").rules(hoistRecip).knobs(RECIP)
  .describe("x / broadcast(b) → x · broadcast(1/b)")
  .check((g) => !g.findAll("tensor.ew").some((v) => v.attrs.fn === "div" && v.knobs.RECIP === true) || "a div survived the rewrite");

// a cost for this fork (fewer flops win), in front of the standard policy chain
const flops = k.decide.cost(({ knobs }) => (knobs.RECIP ? 1 : 4), { name: "flops" }).for("hoist_reciprocal");
const base = std.emmy.pipeline().insertAfter("frontend/optimization", recipPass);
const pipe = base.with({ decide: k.decide.chain(k.decide.pinned(), flops, base._decide) });

const rows = param.int("rows", { min: 16, max: 8192, default: 1024, scale: "log" });
const cols = param.int("cols", { min: 32, max: 8192, default: 1024, scale: "log" });
project("softmax-recip")
  .pipeline(pipe)
  .params(rows, cols)
  .program(({ x }) => ({ y: N.softmax(x, -1) }), ({ param }) => ({ x: k.tensor([param(rows), param(cols)]) }))
  .check("the reciprocal is computed once per row", ({ run }) => {
    if (!run.params.get(RECIP) && run.decisions.some((d) => d.knobs?.RECIP === false)) return true;
    const body = run.at("loop").findAll("loop.kernel").map((v) => v.print()).join("\n");
    return /recip/.test(body) || "no recip in the Loop IR";
  });
