// Range-aware index simplification: the cost model reads coalescing strides from the flat index,
// and a quotient that is constant over the loop ranges must not make an access look non-affine.
import assert from "node:assert/strict";
import * as IX from "../src/core/ix.js";

const { ix } = IX;
const extent = (v) => ({ a0: 128, a1: 96, a3: 96, r: 24 })[v];
// PassBench task 106's conv input index: 221184 * (a1 / 96) + 221184 * a0 + a3 + 9216 * r
const f = ix.add(ix.mul(221184, ix.div("a1", 96)), ix.mul(221184, "a0"), "a3", ix.mul(9216, "r"));
assert.equal(IX.affine(f, ["a0", "a1", "a3", "r"]), null, "unbounded algebra keeps the quotient");
const g = IX.bounded(f, extent);
assert.deepEqual(IX.affine(g, ["a0", "a1", "a3", "r"]).k, { a0: 221184, a3: 1, r: 9216 });
// a quotient spanning two multiples is kept; a remainder of an in-range dividend is the dividend
assert.equal(IX.print(IX.bounded(ix.div("a1", 48), extent)), "a1 / 48");
assert.equal(IX.print(IX.bounded(ix.mod(ix.add("r", 96), 128), extent)), "r + 96");
assert.equal(IX.print(IX.bounded(ix.div(ix.add("r", 96), 96), extent)), "1");
// unknown ranges change nothing
assert.equal(IX.keyOf(IX.bounded(ix.div("z", 4), extent)), IX.keyOf(ix.div("z", 4)));
// every rewrite agrees with evaluation over the ranges
for (let a1 = 0; a1 < 96; a1 += 7) for (let r = 0; r < 24; r += 5)
  assert.equal(IX.evalIx(g, { a0: 3, a1, a3: 11, r }), IX.evalIx(f, { a0: 3, a1, a3: 11, r }));
console.log("bounded index simplification folds range-constant quotients and keeps the rest");
