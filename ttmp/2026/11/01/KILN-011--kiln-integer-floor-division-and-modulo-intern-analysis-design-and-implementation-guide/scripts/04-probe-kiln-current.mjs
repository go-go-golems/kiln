// KILN-011: probe of Kiln's current integer-division behavior (diary Step 3). Usage: node 04-probe-kiln-current.mjs
import { k } from "/home/manuel/code/wesen/kiln/worktrees/passnet/packages/kiln/src/core/kiln.js";
import { N } from "/home/manuel/code/wesen/kiln/worktrees/passnet/packages/kiln/src/std/tensor.js";
import { E } from "/home/manuel/code/wesen/kiln/worktrees/passnet/packages/kiln/src/std/loop.js";
import { FNS } from "/home/manuel/code/wesen/kiln/worktrees/passnet/packages/kiln/src/std/fns.js";
const I = { x: k.tensor([4], "i64"), y: k.tensor([4], "i32") };
const dt = (fn) => { try { const g = k.trace("t", (v) => ({ out: fn(v) }), I); return g.nodes.get(g.outputs[0].id).type.dtype; } catch (e) { return "THROWS " + e.message; } };
console.log("i64 / i64        ", dt(({ x }) => N.div(x, x)));
console.log("i64 / N.int(2)   ", dt(({ x }) => N.div(x, N.int(2))));
console.log("i64 / 2.0 (float)", dt(({ x }) => N.div(x, 2.0)));
console.log("floor(i64)       ", dt(({ x }) => N.floor(x)));
console.log("i32 * N.int(3)   ", dt(({ y }) => N.mul(y, N.int(3))));
console.log("fold add_i64 2^60+1 ->", E.op("add_i64", E.num(2 ** 60), E.num(1)).v, "exact:", 2n ** 60n + 1n);
console.log("BigInt 7n / -2n =", 7n / -2n, " 7n % -2n =", 7n % -2n, " (-7n) % 2n =", -7n % 2n);
try { 1n / 0n; } catch (e) { console.log("1n / 0n throws", e.constructor.name, e.message); }
console.log("JS i32: (-7/2)|0 =", (-7 / 2) | 0, " Math.floor(-7/2) =", Math.floor(-7 / 2), " -7 % 2 =", -7 % 2, " (-2**31)/-1|0 =", ((-(2 ** 31)) / -1) | 0, " 7/0|0 =", (7 / 0) | 0);
console.log("FNS has floor_divide?", "floor_divide" in FNS, "div_i64?", "div_i64" in FNS);
