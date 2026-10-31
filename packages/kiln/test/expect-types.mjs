// nn.expect binds a value to the source framework's recorded type and disappears in decomposition;
// elementwise promotion follows PyTorch: dimensioned tensors dominate 0-dim tensors and scalars.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { SPECS, target } from "../src/std/targets.js";

const hardware = target(SPECS.a100);
const inputs = { x: k.tensor([2, 3], "f16"), s: k.tensor([], "f32") };
assert.throws(() => k.trace("wrong", ({ x, s }) => ({ out: N.expect(N.mul(x, s), [2, 3], "f32") }), inputs),
  /expected \(2, 3\) f32 from the source graph, Kiln inferred \(2, 3\) f16/);
assert.throws(() => k.trace("shape", ({ x }) => ({ out: N.expect(x, [3, 2], "f16") }), inputs), /expected \(3, 2\) f16/);
const g = k.trace("zero-dim", ({ x, s }) => ({ out: N.expect(N.mul(x, s), [2, 3], "f16") }), inputs);
const run = pipeline({ target: hardware }).run(g);
assert.ok(run.ok, run.error?.message);
const prog = programOf(run.graph);
assert.equal(prog.kernels.at(-1).outDtype, "f16", "a 0-dim f32 operand does not promote an f16 tensor");
assert.ok(![...run.at("tensor").nodes.values()].some((n) => n.name === "nn.expect"), "expect decomposes away");
// 0-dim tensors alone still promote among themselves, and two dimensioned dtypes still widen
assert.equal(k.trace("scalars", ({ a, b }) => ({ out: N.add(a, b) }), { a: k.tensor([], "f16"), b: k.tensor([], "f32") }).outputs.length, 1);
const both = k.trace("both", ({ a, b }) => ({ out: N.add(a, b) }), { a: k.tensor([], "f16"), b: k.tensor([], "f32") });
assert.equal(both.nodes.get(both.outputs[0].id).type.dtype, "f32");
const wide = k.trace("wide", ({ a, b }) => ({ out: N.add(a, b) }), { a: k.tensor([4], "f16"), b: k.tensor([4], "bf16") });
assert.equal(wide.nodes.get(wide.outputs[0].id).type.dtype, "f32");
console.log("expect bindings check source types; 0-dim operands follow PyTorch promotion");
