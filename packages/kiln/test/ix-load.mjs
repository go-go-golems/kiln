// Data-dependent index terms (P3a slice 2): ld(i, idx) is opaque to the affine algebra but
// substitutes, keys, prints, evaluates and renumbers through its own index.
import assert from "node:assert/strict";
import * as IX from "../src/core/ix.js";

const { ix } = IX;
const row = IX.LD(1, ["a0"]);                       // ids[a0]
const f = ix.add(ix.mul(row, 64), "a1");            // W[ids[a0], a1] flattened, W of width 64
assert.equal(IX.print(f), "a1 + 64 * in1[a0]");
assert.deepEqual([...IX.vars(f)].sort(), ["a0", "a1"]);
assert.equal(IX.affine(f, ["a0", "a1"]), null, "a gather is not affine");
assert.equal(IX.keyOf(IX.subst(f, { a0: ix.add("e", 2) })), IX.keyOf(ix.add(ix.mul(IX.LD(1, [ix.add("e", 2)]), 64), "a1")));
assert.equal(IX.keyOf(IX.remapLoads(f, (i) => i + 2)), IX.keyOf(ix.add(ix.mul(IX.LD(3, ["a0"]), 64), "a1")));
const ids = [5, 0, 7];
assert.equal(IX.evalIx(f, { a0: 2, a1: 3, __ld: (i, [j]) => (assert.equal(i, 1), ids[j]) }), 7 * 64 + 3);
assert.equal(IX.interval(f, () => 8), null, "a gathered value has no static range");
assert.equal(IX.keyOf(IX.bounded(IX.LD(0, [ix.div("a0", 96)]), () => 96)), IX.keyOf(IX.LD(0, [0])));
assert.equal(IX.emit(f, "c", (v) => v, (i, idx, r) => `(int)src${i}[${idx.map(r).join("")}]`), "(a1 + (64 * (int)src1[a0]))");
assert.throws(() => IX.emit(f, "wgsl"), /no wgsl spelling/);
assert.equal(IX.loadsOf(f).length, 1);
console.log("data-dependent index terms substitute, key, evaluate and emit through their own index");
