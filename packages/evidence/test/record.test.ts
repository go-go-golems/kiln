import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../src/canonical.ts';
import { isDecisive, recordId, validateRecord, type MeasurementRecord } from '../src/record.ts';
import { sha256Hex } from '../src/sha256.ts';
import { makeRecord } from './fixtures.ts';

const errorsOf = (r: unknown): string[] => {
  const v = validateRecord(r);
  return v.ok ? [] : v.errors;
};

describe('recordId', () => {
  it('is the sha256 of the canonical record without its id, independent of key order and of the id itself', () => {
    const r = makeRecord();
    const { id, ...rest } = r;
    expect(id).toBe(sha256Hex(canonicalJSON(rest)));
    expect(recordId({ ...r, id: 'whatever' })).toBe(id);
    const reordered = Object.fromEntries(Object.entries(r).reverse()) as MeasurementRecord;
    expect(recordId(reordered)).toBe(id);
  });
  it('refuses non-canonical content (undefined fields)', () => {
    expect(() => makeRecord((r) => { r.check.maxAbsErr = undefined as unknown as number; })).toThrow(/undefined at \$\.check\.maxAbsErr/);
  });
});

describe('validateRecord', () => {
  it('accepts a well-formed record', () => {
    const v = validateRecord(makeRecord());
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('accepts a simulator record and a legacy row', () => {
    const sim = makeRecord((r) => {
      r.device = { id: 'sim:rtx5090', class: 'sim', name: 'RTX 5090', fingerprint: { spec: sha256Hex('spec'), name: 'RTX 5090' } };
      r.kernel.lang = 'sim';
      r.kernel.contentId = sha256Hex('c');
      r.timing = { kind: 'simulated', unit: 'us', samples: [88.1] };
      r.counts = { dram: 1e6, smemWavefronts: 0 };
      r.countsProv = 'derived';
      r.protocol = { reps: 1, seed: 1 };
    });
    expect(errorsOf(sim)).toEqual([]);
    const legacy = makeRecord((r) => {
      r.by = 'import';
      r.device = { id: 'legacy:webgpu', class: 'webgpu', name: 'WebGPU', fingerprint: {} };
      r.kernel.contentId = '';
      r.kernel.sourceSha256 = '';
      r.kernel.lang = 'cuda';
      r.timing = { kind: 'legacy', unit: 'us', samples: [120] };
      r.validity.partial = ['legacy row: one best value, no repetitions, no content id'];
      r.protocol = { reps: 1, seed: 0 };
    });
    expect(errorsOf(legacy)).toEqual([]);
  });

  it('accepts an invalid record that says why', () => {
    const r = makeRecord((r) => {
      r.activation = { requested: 'MAP=tiled,BLOCK=256', materialized: 'MAP=row,BLOCK=256', ok: false, notes: [] };
      r.validity = { ok: false, reasons: ['activation: requested MAP=tiled,BLOCK=256 materialised MAP=row,BLOCK=256'], partial: [] };
    });
    expect(errorsOf(r)).toEqual([]);
  });

  it('rejects a wrong id', () => {
    expect(errorsOf({ ...makeRecord(), id: sha256Hex('nope') }).join('\n')).toMatch(/^id: expected [0-9a-f]{64}/);
    const r = makeRecord();
    r.timing.samples[0] = 1;
    expect(errorsOf(r).some((e) => e.startsWith('id:'))).toBe(true);
  });

  it.each<[string, (r: Omit<MeasurementRecord, 'id'>) => void, RegExp]>([
    ['format', (r) => { (r as { format: string }).format = 'kiln-evidence/1'; }, /^format:/],
    ['timestamp', (r) => { r.at = '19 Oct 2026'; }, /^at:/],
    ['by', (r) => { (r as { by: string }).by = 'agent'; }, /^by:/],
    ['device id without hash', (r) => { r.device.id = 'webgpu:apple-m3-max'; }, /^device\.id:/],
    ['device id of another class', (r) => { r.device.id = 'cuda:x-12345678'; }, /^device\.id:/],
    ['nested fingerprint', (r) => { (r.device.fingerprint as Record<string, unknown>).clocks = { sm: 1 }; }, /^device\.fingerprint:/],
    ['missing content id', (r) => { r.kernel.contentId = ''; }, /^kernel\.contentId:/],
    ['lang of another device', (r) => { r.kernel.lang = 'cuda'; }, /^kernel\.lang:/],
    ['timing of another device', (r) => { r.timing.kind = 'cuda-events'; }, /^timing\.kind:/],
    ['negative sample', (r) => { r.timing.samples = [1, -2, 3]; }, /^timing\.samples:/],
    ['raw of the wrong length', (r) => { r.timing.raw = [[1]]; }, /^timing\.raw:/],
    ['counts without provenance', (r) => { r.counts = { dram: 1 }; }, /^countsProv:/],
    ['provenance without counts', (r) => { r.countsProv = 'observed'; }, /^countsProv:/],
    ['unknown field', (r) => { (r as Record<string, unknown>).us = 3; }, /^us: unknown field/],
    ['valid but the check failed', (r) => { r.check.ok = false; }, /^validity\.ok: true, but the output check failed/],
    ['valid but not activated', (r) => { r.activation.ok = false; }, /^validity\.ok: true, but the activation check failed/],
    ['valid with fewer samples than repetitions', (r) => { r.protocol = { reps: 5, seed: 1 }; }, /^validity\.ok: true, but there are 3 samples for 5 repetitions/],
    ['invalid without a reason', (r) => { r.validity = { ok: false, reasons: [], partial: [] }; }, /^validity\.reasons: an invalid record must say why/],
    ['wall clock without its caveat', (r) => { r.timing.kind = 'wall-clock'; }, /^validity\.partial:/],
    ['legacy without its caveat', (r) => { r.device.id = 'legacy:webgpu'; r.timing.kind = 'legacy'; }, /^validity\.partial:/],
    ['positions of the wrong length', (r) => { r.protocol.position = [0]; }, /^protocol\.position:/],
  ])('rejects %s', (_name, patch, pattern) => {
    const errors = errorsOf(makeRecord(patch));
    expect(errors.some((e) => pattern.test(e)), errors.join('\n')).toBe(true);
  });

  it('rejects a NaN sample (such a record has no canonical id either)', () => {
    const r = makeRecord();
    r.timing.samples[1] = Number.NaN;
    expect(errorsOf(r)).toEqual(['timing.samples: expected finite non-negative numbers']);
  });

  it('rejects things that are not records', () => {
    expect(validateRecord(null).ok).toBe(false);
    expect(validateRecord([]).ok).toBe(false);
    expect(errorsOf({ format: 'kiln-measure/1' }).length).toBeGreaterThan(5);
  });
});

describe('isDecisive', () => {
  it('requires a valid, complete, non-legacy, fresh record', () => {
    const r = makeRecord();
    expect(isDecisive(r, r.kernel.contentId)).toBe(true);
    expect(isDecisive(r, sha256Hex('a newer kernel'))).toBe(false);
    const wall = makeRecord((x) => { x.timing.kind = 'wall-clock'; x.validity.partial = ['wall clock: includes submit and readback overhead']; });
    expect(isDecisive(wall, wall.kernel.contentId)).toBe(false);
    const bad = makeRecord((x) => { x.check.ok = false; x.validity = { ok: false, reasons: ['check failed'], partial: [] }; });
    expect(isDecisive(bad, bad.kernel.contentId)).toBe(false);
  });
});
