// Storage contracts and reference rounding. Independent IEEE binary conversion;
// does not imply a backend can execute every listed dtype.
const WIDTHS = Object.freeze({ f32: 4, f16: 2, bf16: 2, u8: 1, i32: 4, i64: 8, bool: 1 });
export function dtypeBytes(dtype = 'f32') {
  if (!Object.hasOwn(WIDTHS, dtype)) throw new TypeError(`unsupported dtype: ${dtype}`);
  return WIDTHS[dtype];
}
const scratch = new DataView(new ArrayBuffer(4));
function bits(x) { scratch.setFloat32(0, x, false); return scratch.getUint32(0, false); }
function float(x) { scratch.setUint32(0, x, false); return scratch.getFloat32(0, false); }
export function toBf16Bits(x) {
  const b = bits(x);
  if ((b & 0x7fffffff) > 0x7f800000) return ((b >>> 16) | 0x40) & 0xffff;
  return ((b + 0x7fff + ((b >>> 16) & 1)) >>> 16) & 0xffff;
}
export function fromBf16Bits(x) { return float((x & 0xffff) << 16); }
export function toF16Bits(x) {
  const b = bits(x), sign = (b >>> 16) & 0x8000;
  const exp = (b >>> 23) & 255, mant = b & 0x7fffff;
  if (exp === 255) return sign | (mant ? 0x7e00 : 0x7c00);
  let e = exp - 127 + 15;
  if (e >= 31) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;
    const m = mant | 0x800000, shift = 14-e;
    const base = m >>> shift, remainder = m & ((1 << shift)-1), half = 1 << (shift-1);
    return sign | (base + (remainder > half || (remainder === half && (base & 1)) ? 1 : 0));
  }
  let m = mant >>> 13;
  const rest = mant & 8191;
  if (rest > 4096 || (rest === 4096 && (m & 1))) {
    m++;
    if (m === 1024) { m = 0; e++; }
  }
  return sign | (e << 10) | m;
}
export function fromF16Bits(x) {
  x &= 0xffff;
  const sign = x & 0x8000 ? -1 : 1, e = (x >>> 10) & 31, m = x & 1023;
  if (e === 31) return m ? NaN : sign * Infinity;
  return sign * (e ? (1+m/1024)*2**(e-15) : m*2**-24);
}
export function roundToDtype(x, dtype) {
  if (dtype === 'f32') return Math.fround(x);
  if (dtype === 'f16') return fromF16Bits(toF16Bits(x));
  if (dtype === 'bf16') return fromBf16Bits(toBf16Bits(x));
  throw new TypeError(`no floating rounding rule for ${dtype}`);
}
