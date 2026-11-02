// KILN-008 Phase 0: the tiled materializer stages every contraction operand through its own temporary.
// A masked integer contraction (an f32 0/1 table view against i64 data, the shape of the former
// cumsum lowering) has operands of two dtypes; one shared staging name "tv" was refused by valueTypes.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { T, tensor } from "../src/std/tensor.js";
import { Tensor } from "../src/core/util.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { SPECS, target } from "../src/std/targets.js";
import { typedReducer } from "../src/std/fns.js";

const pipe = pipeline({ target: target(SPECS.a100) });
// out[r, i] = sum_j [j <= i] x[r, j], spelled in Tensor IR as the masked reduction over a table view
const masked = (rows, n) => k.trace("masked", ({ x }) => {
  const wide = [rows, n, n];
  const spread = T.view(x, wide, (c) => [c[0], c[2]]);
  const mask = T.view(tensor.const({ data: new Tensor([2], Float32Array.of(1, 0)), shape: [2] }), wide, (c) => [c[1].sub(c[2]).lt(0)]);
  const sel = tensor.ew([mask, spread, T.bc(tensor.const({ value: 0, shape: [], dtype: "i64" }), wide)], { fn: "select", dtype: "i64" });
  return { out: T.squeeze(T.reduce(sel, typedReducer("add", "i64"), -1), -1) };
}, { x: k.tensor([rows, n], "i64") });

for (const [rows, n] of [[8, 1024], [2, 40]]) {
  const g = masked(rows, n);
  const r = pipe.run(g, { params: { MAP: "tiled" } });
  assert.ok(!r.error, `${rows}x${n}: ${r.error?.message}`);
  const kern = programOf(r.graph).kernels.find((x) => x.map.MAP === "tiled");
  assert.ok(kern, `${rows}x${n}: the masked sum is mapped as a contraction`);
  // the two staging temporaries are distinct names of distinct storage types
  assert.match(kern.cuda, /float [^;]*\btv\d+ = 0\.0f/, "the f32 table operand stages through a float temporary");
  assert.match(kern.cuda, /long long [^;]*\btv\d+ = 0\b/, "the i64 data operand stages through an int64 temporary");
  // the Loop IR (the reference every schedule is checked against) is exact
  const x = new Tensor([rows, n], BigInt64Array.from({ length: rows * n }, (_, i) => BigInt((i * 7919) % 1000 - 500) * 2n ** 40n));
  const got = r.at("loop").eval({ x }).out.data;
  for (let row = 0; row < rows; row++) {
    let acc = 0n;
    for (let i = 0; i < n; i++) { acc = BigInt.asIntN(64, acc + x.data[row * n + i]); assert.equal(got[row * n + i], acc); }
  }
}
console.log("tiled materializer: per-operand staging temporaries for mixed-dtype contractions");
