/** W-21 The matmul ladder
 *  group  GPU optimization
 *  about  one 1024×1024 matmul, five schedules: naive, shared-memory tiles, 1-D and 2-D register tiles, and the cost model's pick. Each step fixes the previous step's bottleneck
 *  try    Walk me through the ladder: at each step, what is the bottleneck and which metric shows it? | Why is the 8×8 register tile slower than 8×2 here?
 */
// C = A·B, every element a dot product of length N: 2N³ flops over 12N² bytes of unique data, so a
// matmul has plenty of reuse (N/6 flop per unique byte). The schedule decides how much of that reuse
// reaches the hardware: every step below cuts the traffic of one level of the memory hierarchy.
// The `step` slider pins the tile pass's choice through a custom decide policy. See the Notes.
const N_ = param.int("n", { min: 256, max: 2048, default: 1024, scale: "log", help: "C = A·B with A, B, C all n×n" });
const STEP = param.enum("step", ["1 naive", "2 smem tiles", "3 1-D register tiles", "4 2-D register tiles", "5 8x8 tiles", "6 cost model"], { default: "1 naive", help: "which schedule the tile pass must take" });
const LADDER = {
  "1 naive":                 { MAP: "thread", TPB: 256, COARSEN: 1 },
  "2 smem tiles":            { MAP: "tiled", BM: 32, BN: 32, BK: 32, TM: 1, TN: 1 },
  "3 1-D register tiles":    { MAP: "tiled", BM: 64, BN: 64, BK: 8, TM: 8, TN: 1 },
  "4 2-D register tiles":    { MAP: "tiled", BM: 128, BN: 128, BK: 8, TM: 8, TN: 2 },
  "5 8x8 tiles":             { MAP: "tiled", BM: 128, BN: 128, BK: 8, TM: 8, TN: 8 },
};

// a decide policy: score 0 for the option the step names, Infinity for the others; "6 cost model" passes
const ladder = k.decide.cost(({ knobs, run }) => {
  const want = LADDER[run.params.get(STEP)];
  if (!want) return null;
  return Object.entries(want).every(([key, v]) => knobs[key] === v) ? 0 : Infinity;
}, { name: "ladder" }).for("schedule");
const base = std.emmy.pipeline();

project("matmul-ladder")
  .pipeline(base.with({ decide: k.decide.chain(k.decide.pinned(), ladder, base._decide) }))
  .params(N_, STEP)
  .program(({ a, b }) => ({ c: N.matmul(a, b) }), ({ param }) => ({ a: k.tensor([param(N_), param(N_)]), b: k.tensor([param(N_), param(N_)]) }))
  .check("the schedule this step asks for", ({ run }) => {
    const d = run.decisions[0], want = LADDER[run.params.get(STEP)];
    if (!want) return { ok: true, message: `the cost model picked ${std.tile.canonRow(d.knobs)}` };
    return Object.entries(want).every(([key, v]) => d.knobs[key] === v) ? { ok: true, message: std.tile.canonRow(d.knobs) } : `got ${std.tile.canonRow(d.knobs)} (illegal on this device?)`;
  });
