// compare (the end-to-end check's comparison): equal infinities and NaN at the same position agree; a NaN
// against a number, or infinities of different sign, differ.
import assert from 'node:assert/strict';
import {compare} from '../src/core/util.js';

assert.equal(compare(Float32Array.of(NaN, Infinity, -Infinity, 1), Float32Array.of(NaN, Infinity, -Infinity, 1)).ok, true);
assert.equal(compare(Float32Array.of(NaN, Infinity, -Infinity, 1), Float32Array.of(NaN, Infinity, -Infinity, 1)).maxAbs, 0);
assert.equal(compare(Float32Array.of(NaN), Float32Array.of(0)).bad, 1);
assert.equal(compare(Float32Array.of(0), Float32Array.of(NaN)).bad, 1);
assert.equal(compare(Float32Array.of(Infinity), Float32Array.of(-Infinity)).bad, 1);
assert.equal(compare(Float32Array.of(1), Float32Array.of(1 + 1e-6)).ok, true);
console.log('compare-nonfinite: ok');
