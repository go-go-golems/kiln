// P3a slice 1: i64 and bool tensors are copied through views exactly (integer temporaries, no
// float round trip); arithmetic and conversions on them are refused by name until slice 3.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

const pipe = pipeline({ target: target(SPECS.a100) });
const compile = (fn, inputs) => { const r = pipe.run(k.trace("t", fn, inputs)); if (r.error) return r.error.message; return exportProgram(r, programOf(r.graph)); };

for (const [dtype, ctype] of [["i64", "long long"], ["bool", "bool"]]) {
  const p = compile(({ x }) => ({ out: N.transpose(N.reshape(x, [2, 4])) }), { x: k.tensor([8], dtype) });
  assert.equal(typeof p, "object", String(p));
  const [kn] = p.kernels;
  assert.ok(kn.cuda.includes(`const ${ctype}* __restrict__ src0`) && kn.cuda.includes(`${ctype}* __restrict__ dst`), kn.cuda);
  assert.ok(new RegExp(`\\n\\s+${ctype} in0 = 0;`).test(kn.cuda), "the loaded value is an integer temporary");
  assert.ok(!/float in0/.test(kn.cuda), "no float temporary for an integer value");
  assert.match(kn.wgslUnavailable, new RegExp(`WGSL storage dtype unsupported: ${dtype}`));
  assert.deepEqual(p.buffers.map((b) => b.dtype), [dtype, dtype]);
}
// a cast to the value's own dtype is the value: no kernel
assert.equal(compile(({ x }) => ({ out: N.cast(x, "i64") }), { x: k.tensor([8], "i64") }).kernels.length, 0);
// integer and float outputs coexist in one program
assert.equal(compile(({ x, ids }) => ({ a: N.relu(x), b: N.reshape(ids, [4, 1]) }), { x: k.tensor([4]), ids: k.tensor([4], "i64") }).kernels.length, 2);
// refused by name
assert.match(compile(({ x }) => ({ out: N.add(x, x) }), { x: k.tensor([8], "i64") }), /integer arithmetic is not lowered \(P3a slice 3\): add/);
assert.match(compile(({ x }) => ({ out: N.cast(x, "f32") }), { x: k.tensor([8], "i64") }), /integer arithmetic is not lowered/);
console.log("integer storage passes through views exactly and refuses arithmetic by name");
