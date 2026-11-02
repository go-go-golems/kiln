// KILN-011 Phase 0: loop-level literals of typed integer functions are exact. E.num keeps a BigInt's
// decimal digits (exact) beside its nearest double; folding an all-literal typed integer application
// does not round through Number(); the intern key distinguishes literals that share a double; the
// serial evaluator spells integer-context literals without f32 rounding; CUDA prints the exact digits.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { Tensor } from "../src/core/util.js";
import { E } from "../src/std/loop.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

// folding keeps i64 results exact past 2^53, and wraps at 2^63 as the reference does
const folded = E.op("add_i64", E.num(2n ** 60n), E.num(1n));
assert.equal(folded.k, "num");
assert.equal(folded.exact, "1152921504606846977");
assert.equal(E.op("add_i64", E.num(2 ** 60), E.num(1)).exact, "1152921504606846977", "number operands fold through BigInt");
assert.equal(E.op("add_i64", E.num(2n ** 63n - 1n), E.num(1n)).exact, String(-(2n ** 63n)));
// i32 and bool results stay numbers; comparisons of exact operands are exact
assert.equal(E.op("add_i32", E.num(2 ** 31 - 1), E.num(1)).v, -(2 ** 31));
assert.equal(E.op("add_i32", E.num(1), E.num(2)).exact, undefined);
assert.equal(E.op("eq_i64", E.num(2n ** 60n), E.num(2n ** 60n + 1n)).v, 0, "two literals sharing a double compare unequal");
// the intern key: literals that differ only past 2^53 are distinct nodes; a number and a BigInt are distinct
assert.notEqual(E.num(2n ** 60n), E.num(2n ** 60n + 1n));
assert.equal(E.num(2n ** 60n + 1n), E.num(2n ** 60n + 1n));
assert.notEqual(E.num(5), E.num(5n));
// a float fold is unchanged: it rounds to f32
assert.equal(E.op("add", E.num(16777216), E.num(1)).v, 16777216);

// through the pipeline: an integer literal above 2^24 is not rounded to f32 by the serial evaluator,
// and a folded 2^60 + 1 reaches the loop evaluator and CUDA exactly
const pipe = pipeline({ target: target(SPECS.a100) });
const g = k.trace("lits", ({ x }) => ({
  small: N.add(x, N.int(16777217)),
  big: N.add(x, N.add(N.int(2 ** 60), N.int(1))),
  cmp: N.eq(x, N.add(N.int(2 ** 60), N.int(1))),
  // a folded int64 scalar converts at compile time: to int32 wraps, to float rounds
  narrow: N.add(N.cast(x, "i32"), N.cast(N.add(N.int(2 ** 32), N.int(7)), "i32")),
  widen: N.mul(N.cast(x, "f32"), N.cast(N.add(N.int(2 ** 24), N.int(1)), "f32")),
}), { x: k.tensor([3], "i64") });
const x = new Tensor([3], BigInt64Array.from([0n, 1n, 2n ** 60n + 1n]));
const ref = g.eval({ x });
assert.deepEqual([...ref.small.data], [16777217n, 16777218n, 2n ** 60n + 16777218n]);
assert.deepEqual([...ref.big.data], [2n ** 60n + 1n, 2n ** 60n + 2n, 2n ** 61n + 2n]);
assert.deepEqual([...ref.cmp.data], [0, 0, 1]);
assert.deepEqual([...ref.narrow.data], [7, 8, 8]);
assert.deepEqual([...ref.widen.data].slice(0, 2), [0, 16777216]);
const r = pipe.run(g);
assert.ok(!r.error, r.error?.message);
const got = r.at("loop").eval({ x });
for (const name of Object.keys(ref)) assert.deepEqual([...got[name].data], [...ref[name].data], name);
const cuda = exportProgram(r, programOf(r.graph)).kernels.map((kn) => kn.cuda).join("\n");
assert.match(cuda, /16777217LL/);
assert.match(cuda, /1152921504606846977LL/, "a folded int64 literal is spelled with its exact digits");
assert.ok(!/1152921504606847000/.test(cuda), "no double-rounded int64 literal");

console.log("exact integer constant folding: E.num BigInt literals, intern keys, evaluator and CUDA spelling");
