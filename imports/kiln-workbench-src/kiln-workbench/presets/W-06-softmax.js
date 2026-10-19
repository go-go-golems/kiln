/** W-06 Softmax in one kernel
 *  group  ML compiler
 *  about  max, exp-sum and normalize fuse into one row kernel with three sweeps: loop-invariant code motion at work
 *  try    How many times does each row get read from DRAM? | Compare MAP=thread and MAP=row on the H100
 */
// softmax(x) = exp(x − max(x)) / Σ exp(x − max(x)), row by row. Decomposed, that is two reductions and
// three elementwise ops over a row. Fusion inlines them all into one Loop IR kernel; scheduling places each
// computation at the deepest loop it depends on (LICM), which yields three sweeps per row: max, then sum,
// then write. The tile pass maps a row to a block (MAP=row) with staging: the row is read from DRAM once.
const rows = param.int("rows", { min: 16, max: 8192, default: 1024, scale: "log" });
const cols = param.int("cols", { min: 32, max: 8192, default: 1024, scale: "log" });

project("softmax")
  .params(rows, cols)
  .program(({ x }) => ({ y: N.softmax(x, -1) }), ({ param }) => ({ x: k.tensor([param(rows), param(cols)]) }))
  .check("rows sum to 1", ({ outputs }) => {
    const y = outputs.y, C = y.shape[1];
    for (let r = 0; r < y.shape[0]; r += Math.max(1, y.shape[0] >> 4)) { let s = 0; for (let c = 0; c < C; c++) s += y.data[r * C + c]; if (Math.abs(s - 1) > 1e-4) return `row ${r} sums to ${s}`; }
    return true;
  });
