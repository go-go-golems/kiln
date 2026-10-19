/** W-23 Occupancy and latency hiding
 *  group  GPU optimization
 *  about  softmax over long rows: threads per block and shared-memory staging decide how many warps an SM can keep in flight, and that decides the bandwidth you get
 *  try    Pin TPB=32 and explain the occupancy number and its limiter | Why can staging the row in shared memory make this slower?
 */
// A GPU hides memory latency by switching between warps: while one waits ~0.5–1 µs for DRAM, others run.
// How many warps an SM holds at once (occupancy) is capped by four budgets: threads, blocks, registers
// and shared memory per SM. This kernel reads each row three times (max, sum, normalize); staging the
// row in shared memory turns two of those reads into on-chip reads, but a 32 KiB row per block also
// eats the SM's shared memory and with it the occupancy. Pin TPB and STAGE from the Notes and measure.
const rows = param.int("rows", { min: 64, max: 8192, default: 2048, scale: "log" });
const dim = param.int("dim", { min: 256, max: 8192, default: 8192, scale: "log" });

project("occupancy-softmax")
  .params(rows, dim)
  .program(({ x }) => ({ y: N.softmax(x, -1) }), ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  .check("occupancy of the compiled kernel", ({ run }) => {
    const d = run.decisions[0];
    return { ok: true, message: `schedule ${std.tile.canonRow(d.knobs)} (picked by ${d.by}); measure to see occupancy and its limiter in Perf` };
  });
