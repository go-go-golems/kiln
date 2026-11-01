// KILN-011: integer floor division, floor modulo, trunc division and fmod. PyTorch's // and % round
// toward negative infinity (the remainder has the divisor's sign); torch.div(rounding_mode="trunc") and
// fmod round toward zero (fmod has the dividend's sign). Expected values are PyTorch 2.11 CPU results
// (design guide Section 4.4); INT_MIN / -1 wraps to INT_MIN in every quotient.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { Tensor } from "../src/core/util.js";
import { E } from "../src/std/loop.js";
import { FNS, CUDA_HELPERS } from "../src/std/fns.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

const pipe = pipeline({ target: target(SPECS.a100) });
const OPS = ["floordiv", "remainder", "truncdiv", "fmod"];
const build = { floordiv: N.floordiv, remainder: N.remainder, truncdiv: (a, b) => N.div(a, b, "trunc"), fmod: N.fmod };
const dtypeOf = (fn, inputs) => { const g = k.trace("t", (v) => ({ out: fn(v) }), inputs); return g.nodes.get(g.outputs[0].id).type.dtype; };

// the sign table, plus INT_MIN by -1 and 1, INT_MAX by -1, and divisors larger than the dividend
const MIN = { i32: -(2 ** 31), i64: -(2n ** 63n) }, MAX = { i32: 2 ** 31 - 1, i64: 2n ** 63n - 1n };
const cases = (t) => {
  const c = (v) => (t === "i64" ? BigInt(v) : Number(v));
  return {
    a: [7, -7, 7, -7, 0, 6, -6, 1, -1, 5].map(c).concat([MIN[t], MIN[t], MAX[t], MIN[t] + c(1)]),
    b: [2, 2, -2, -2, 3, -3, 3, -5, 5, -5].map(c).concat([c(-1), c(1), c(-1), c(-2)]),
  };
};
const WANT = {
  floordiv: (t) => [3, -4, -4, 3, 0, -2, -2, -1, -1, -1].map(String).concat([MIN[t], MIN[t], -MAX[t], (MIN[t] + (t === "i64" ? 1n : 1)) / (t === "i64" ? -2n : -2)].map((v) => String(t === "i32" ? Math.floor(v) : v))),
  remainder: () => [1, 1, -1, -1, 0, 0, 0, -4, 4, 0, 0, 0, 0, -1].map(String),
  truncdiv: (t) => [3, -3, -3, 3, 0, -2, -2, 0, 0, -1].map(String).concat([MIN[t], MIN[t], -MAX[t], t === "i64" ? (MIN.i64 + 1n) / -2n : Math.trunc((MIN.i32 + 1) / -2)].map(String)),
  fmod: () => [1, -1, 1, -1, 0, 0, 0, 1, -1, 0, 0, 0, 0, -1].map(String),
};
// INT_MIN + 1 = -(2^k - 1), divided by -2: floor and trunc agree (2^(k-1) - 1, remainder -1)
assert.deepEqual(WANT.floordiv("i64").slice(-1), [String(2n ** 62n - 1n)]);

for (const t of ["i32", "i64"]) {
  const { a, b } = cases(t);
  const arr = (v) => new Tensor([v.length], t === "i64" ? BigInt64Array.from(v) : Int32Array.from(v));
  const inputs = { a: arr(a), b: arr(b) };
  // function level
  for (const op of OPS) assert.deepEqual(a.map((x, i) => String(FNS[`${op}_${t}`].js(x, b[i]))), WANT[op](t), `${op}_${t} reference`);
  // frontend reference and loop level, through the whole pipeline
  const g = k.trace(`div_${t}`, ({ a, b }) => Object.fromEntries(OPS.map((op) => [op, build[op](a, b)])), { a: k.tensor([a.length], t), b: k.tensor([b.length], t) });
  const ref = g.eval(inputs);
  for (const op of OPS) {
    assert.equal(ref[op].dtype, t, `${op} over ${t} keeps ${t}`);
    assert.deepEqual([...ref[op].data].map(String), WANT[op](t), `${op} ${t} frontend`);
  }
  const r = pipe.run(g);
  assert.ok(!r.error, r.error?.message);
  const got = r.at("loop").eval(inputs);
  for (const op of OPS) assert.deepEqual([...got[op].data].map(String), WANT[op](t), `${op} ${t} loop`);
  // CUDA: each kernel calls its helper and defines it once, with integer operands only
  const p = exportProgram(r, programOf(r.graph));
  for (const op of OPS) {
    const kn = p.kernels.find((kk) => kk.cuda.includes(`kiln_${op}_${t}(in`));
    assert.ok(kn, `a kernel applies kiln_${op}_${t}`);
    assert.equal(kn.cuda.split(CUDA_HELPERS[`kiln_${op}_${t}`]).length, 2, `kiln_${op}_${t} is defined once`);
  }
  assert.ok(!p.kernels.some((kk) => kk.cuda.includes("kiln_round_tf32")), "no unused helper");
  assert.deepEqual(p.outputs.map((o) => o.dtype), OPS.map(() => t));
}

// int64 values past 2^53 are exact: the reference never rounds through doubles
assert.equal(FNS.remainder_i64.js(-(2n ** 62n) - 3n, 2n ** 40n), 1099511627773n);
assert.equal(FNS.floordiv_i64.js(-(2n ** 62n) - 3n, 2n ** 40n), -(2n ** 22n) - 1n);
assert.equal(FNS.fmod_i64.js(-(2n ** 62n) - 3n, 2n ** 40n), -3n);

// promotion follows PyTorch: an int scalar keeps int32; a dimensioned int64 widens; bool promotes to
// int64 with an int scalar; true division of integers is f32; bool and float operands are refused
const I = { x: k.tensor([4], "i64"), y: k.tensor([4], "i32"), b: k.tensor([4], "bool"), z: k.tensor([], "i64"), f: k.tensor([4]) };
assert.equal(dtypeOf(({ y }) => N.floordiv(y, N.int(3)), I), "i32");
assert.equal(dtypeOf(({ y, z }) => N.remainder(y, z), I), "i32", "a 0-dim int64 does not widen int32");
assert.equal(dtypeOf(({ x, y }) => N.floordiv(y, x), I), "i64");
assert.equal(dtypeOf(({ b }) => N.floordiv(b, N.int(2)), I), "i64");
assert.equal(dtypeOf(({ y }) => N.div(y, N.int(2), "trunc"), I), "i32");
assert.equal(dtypeOf(({ x }) => N.div(x, x), I), "f32");
assert.equal(dtypeOf(({ b }) => N.div(b, b), I), "f32", "bool / bool is float");
assert.throws(() => dtypeOf(({ b }) => N.floordiv(b, b), I), /floordiv over bool values is not lowered/);
assert.throws(() => dtypeOf(({ b }) => N.fmod(b, b), I), /fmod over bool values is not lowered/);
assert.equal(dtypeOf(({ f }) => N.floordiv(f, N.int(2)), I), "f32", "float floor division (float-division.mjs)");
assert.equal(dtypeOf(({ x }) => N.floordiv(x, 2.0), I), "f32", "a float scalar promotes to float");
assert.throws(() => dtypeOf(({ h }) => N.floordiv(h, N.int(2)), { h: k.tensor([4], "f16") }), /floordiv over f16 values is not lowered/);
assert.equal(dtypeOf(({ x }) => N.floor(x), I), "i64", "floor of an integer is the integer");
assert.throws(() => dtypeOf(({ x }) => N.div(x, x, "round"), I), /rounding mode/);
for (const op of OPS) assert.throws(() => dtypeOf(({ x }) => build[op](x, N.int(0)), I), (e) => e.kind === "ZeroDivisionError", `${op} by a literal zero`);
assert.equal(dtypeOf(({ x }) => N.div(x, N.int(0)), I), "f32", "true division by a literal zero is float division (inf)");

// true division converts both integers to f32 first, as PyTorch does: (2^24 + 1) / 1 is 2^24
const td = k.trace("truediv", ({ x, y }) => ({ q: N.div(x, y), h: N.div(x, N.int(2)) }), { x: k.tensor([3], "i64"), y: k.tensor([3], "i32") });
const tin = { x: new Tensor([3], BigInt64Array.from([16777217n, -7n, 7n])), y: new Tensor([3], Int32Array.from([1, 2, -2])) };
const tref = td.eval(tin);
assert.deepEqual([...tref.q.data], [16777216, -3.5, -3.5]);
assert.deepEqual([...tref.h.data], [8388608, -3.5, 3.5]);
const tr = pipe.run(td);
assert.ok(!tr.error, tr.error?.message);
const tgot = tr.at("loop").eval(tin);
assert.deepEqual([...tgot.q.data], [...tref.q.data]);
assert.deepEqual([...tgot.h.data], [...tref.h.data]);

// a data zero divisor raises ZeroDivisionError in the frontend reference and in the loop evaluator
const zg = k.trace("zero", ({ x, y }) => ({ out: N.floordiv(x, y) }), { x: k.tensor([2], "i64"), y: k.tensor([2], "i64") });
const zin = { x: new Tensor([2], BigInt64Array.from([1n, 2n])), y: new Tensor([2], BigInt64Array.from([1n, 0n])) };
assert.throws(() => zg.eval(zin), (e) => e.kind === "ZeroDivisionError");
const zr = pipe.run(zg);
assert.ok(!zr.error, zr.error?.message);
assert.throws(() => zr.at("loop").eval(zin), (e) => e.kind === "ZeroDivisionError");

// the corpus idiom (yolov10l): idx // 80 and idx % 80 over int64, with exact literal divisors
const yg = k.trace("yolo", ({ idx }) => ({ cls: N.remainder(idx, N.int(80)), anchor: N.floordiv(idx, N.int(80)) }), { idx: k.tensor([1, 6], "i64") });
const yin = { idx: new Tensor([1, 6], BigInt64Array.from([0n, 79n, 80n, 179n, 23999n, -1n])) };
const yref = yg.eval(yin);
assert.deepEqual([...yref.cls.data], [0n, 79n, 0n, 19n, 79n, 79n]);
assert.deepEqual([...yref.anchor.data], [0n, 0n, 1n, 2n, 299n, -1n]);
const yr = pipe.run(yg);
assert.ok(!yr.error, yr.error?.message);
const ygot = yr.at("loop").eval(yin);
assert.deepEqual([...ygot.cls.data], [...yref.cls.data]);
assert.deepEqual([...ygot.anchor.data], [...yref.anchor.data]);
const ycuda = exportProgram(yr, programOf(yr.graph)).kernels.map((kn) => kn.cuda).join("\n");
assert.match(ycuda, /kiln_floordiv_i64\(in0, 80LL\)/);
assert.match(ycuda, /kiln_remainder_i64\(in0, 80LL\)/);
assert.ok(!/[0-9]\.0f|[0-9]f\b/.test(ycuda.split("\n").filter((l) => /kiln_(floordiv|remainder)_i64\(in/.test(l)).join("\n")), "no float literal in integer division");

// loop-level folding of all-literal divisions is exact, and a folded zero divisor is a KilnError
assert.equal(E.op("floordiv_i64", E.num(-7n), E.num(2n)).exact, "-4");
assert.equal(E.op("remainder_i64", E.num(-(2n ** 62n) - 3n), E.num(2n ** 40n)).exact, "1099511627773");
assert.equal(E.op("floordiv_i32", E.num(-7), E.num(2)).v, -4);
assert.throws(() => E.op("fmod_i64", E.num(1n), E.num(0n)), (e) => e.kind === "ZeroDivisionError");
// a frontend all-literal division folds through foldSplatEw with the same result
const fg = k.trace("fold", ({ x }) => ({ out: N.add(x, N.floordiv(N.int(-7), N.int(2))) }), { x: k.tensor([1], "i64") });
const fr = pipe.run(fg);
assert.ok(!fr.error, fr.error?.message);
assert.deepEqual([...fr.at("loop").eval({ x: new Tensor([1], BigInt64Array.from([10n])) }).out.data], [6n]);

console.log("integer division: floordiv, remainder, truncdiv, fmod over i32/i64; true division; zero divisors; CUDA helpers");
