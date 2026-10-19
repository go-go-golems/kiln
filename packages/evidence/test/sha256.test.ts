import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isSha256Hex, sha256Hex } from '../src/sha256.ts';
import { rng } from '../src/stats.ts';

const ref = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex');

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 examples', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('agrees with node:crypto at every padding boundary', () => {
    for (let n = 0; n <= 200; n++) {
      const s = 'x'.repeat(n);
      expect(sha256Hex(s), `length ${n}`).toBe(ref(s));
    }
  });

  it('agrees with node:crypto on random bytes, including multi-block inputs', () => {
    for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096, 65537]) {
      const b = new Uint8Array(randomBytes(n));
      expect(sha256Hex(b), `${n} bytes`).toBe(ref(b));
    }
  });

  it('hashes strings as UTF-8, like node:crypto (non-ASCII, astral, lone surrogates)', () => {
    const r = rng('sha256-strings');
    const alphabet = ['a', 'é', 'ß', '中', '文', '😀', '🧪', '\u0000', '\n', '\ud800', '\udfff', 'Ω', '́'];
    for (let i = 0; i < 300; i++) {
      let s = '';
      const len = Math.floor(r() * 90);
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(r() * alphabet.length)];
      expect(sha256Hex(s), JSON.stringify(s)).toBe(ref(s));
    }
  });

  it('refuses other input types', () => {
    expect(() => sha256Hex(42 as unknown as string)).toThrow(TypeError);
  });

  it('recognises digests', () => {
    expect(isSha256Hex(sha256Hex('a'))).toBe(true);
    expect(isSha256Hex('ABC')).toBe(false);
    expect(isSha256Hex(sha256Hex('a').toUpperCase())).toBe(false);
  });
});
