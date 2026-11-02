// A constant no kernel absorbs (ernie-m's positions: cumsum of torch.ones((1, 15), dtype=int64)) is exported as a
// typed data buffer in its own storage dtype; constantBytes encodes every storage dtype little-endian.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram, constantBytes } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

const pipe = pipeline({ target: target(SPECS.a100) });
const g = k.trace("positions", ({ x }) => {
  const ones = N.full([1, 15], 1, "i64");
  return { pos: N.add(N.sub(N.cumsum(ones, 1), ones), N.int(2)), y: N.mul(x, 2) };
}, { x: k.tensor([1, 15]) });
const r = pipe.run(g), p = exportProgram(r, programOf(r.graph));
const constants = p.buffers.filter((b) => b.data);
for (const b of constants) {
  const bytes = Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0));
  assert.equal(bytes.length, b.bytes, "a constant's data fills its buffer");
  if (b.dtype === "i64") assert.deepEqual([...new BigInt64Array(bytes.buffer)].slice(0, b.elements), new Array(b.elements).fill(1n));
}
assert.deepEqual([...constantBytes([1, -2], "i64", 16)], [1, 0, 0, 0, 0, 0, 0, 0, 254, 255, 255, 255, 255, 255, 255, 255]);
assert.deepEqual([...constantBytes([1, 0, 3], "bool", 4)], [1, 0, 1, 0]);
assert.deepEqual([...constantBytes([1], "f16", 4)], [0x00, 0x3c, 0, 0]);
assert.deepEqual([...constantBytes([1], "bf16", 4)], [0x80, 0x3f, 0, 0]);
assert.deepEqual([...constantBytes([-3], "i32", 4)], [253, 255, 255, 255]);
console.log(`export-typed-constants: ok (${constants.length} constant buffer(s): ${constants.map((b) => b.dtype).join(", ") || "none, the splat was absorbed"})`);
