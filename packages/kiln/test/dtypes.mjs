import test from 'node:test';
import assert from 'node:assert/strict';
import { dtypeBytes, toF16Bits, fromF16Bits, toBf16Bits, fromBf16Bits, roundToDtype } from '../src/core/dtypes.js';
test('storage widths reject unknown types', () => {
  assert.equal(dtypeBytes('f16'),2); assert.equal(dtypeBytes('bf16'),2);
  assert.equal(dtypeBytes('i64'),8); assert.equal(dtypeBytes('u8'),1);
  assert.throws(()=>dtypeBytes('typo'),/unsupported/);
});
test('all finite half encodings roundtrip including signed zero', () => {
  for(let b=0;b<65536;b++) if((b&0x7c00)!==0x7c00) assert.equal(toF16Bits(fromF16Bits(b)),b);
  assert.ok(Object.is(fromF16Bits(0x8000),-0));
});
test('half boundaries and ties to even', () => {
  assert.equal(toF16Bits(1+2**-11),0x3c00);
  assert.equal(toF16Bits(1+3*2**-11),0x3c02);
  assert.equal(toF16Bits(2**-25),0);
  assert.equal(toF16Bits(3*2**-25),2);
  assert.equal(toF16Bits(65520),0x7c00);
  assert.ok(Number.isNaN(roundToDtype(NaN,'f16')));
});
test('all finite bfloat encodings roundtrip and midpoint ties', () => {
  for(let b=0;b<65536;b++) if((b&0x7f80)!==0x7f80) assert.equal(toBf16Bits(fromBf16Bits(b)),b);
  assert.equal(toBf16Bits(1+2**-8),0x3f80);
  assert.equal(toBf16Bits(1+3*2**-8),0x3f82);
  assert.ok(Number.isNaN(roundToDtype(NaN,'bf16')));
});
