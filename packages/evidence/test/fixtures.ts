// Shared test fixtures.
import { contentId, deviceId } from '../src/identity.ts';
import { recordId, type MeasurementRecord } from '../src/record.ts';
import { sha256Hex } from '../src/sha256.ts';

const WGSL = '@compute @workgroup_size(256) fn main() {}';
const FP = { vendor: 'apple', architecture: 'metal-3', device: '', description: 'Apple M3 Max', timestamps: true, userAgent: 'Chrome/141' };

/** A complete, valid WebGPU record; `patch` edits it before the id is computed. */
export function makeRecord(patch: (r: Omit<MeasurementRecord, 'id'>) => void = () => {}): MeasurementRecord {
  const launch = { grid: 4096, block: 256, smem: 0 };
  const fp = { ...FP };
  const r: Omit<MeasurementRecord, 'id'> = {
    format: 'kiln-measure/1',
    at: '2026-10-19T15:00:00.000Z',
    by: 'measure',
    device: { id: deviceId('webgpu', 'Apple M3 Max', fp), class: 'webgpu', name: 'Apple M3 Max', fingerprint: fp },
    kernel: {
      name: 'rms_norm', identity: 'a1b2c3', row: 'MAP=row,BLOCK=256', knobs: { MAP: 'row', BLOCK: 256 },
      contentId: contentId({ codegen: 'kiln-codegen/1', lang: 'wgsl', sourceSha256: sha256Hex(WGSL), launch, inputs: [{ shape: [4096, 4096], seed: 7 }], output: [4096, 4096], target: null }),
      lang: 'wgsl', sourceSha256: sha256Hex(WGSL), launch,
    },
    timing: { kind: 'gpu-timestamp', unit: 'us', samples: [101.5, 99.8, 100.2], launches: 20, warmup: 3 },
    check: { ok: true, sampled: 512, maxAbsErr: 1e-6 },
    activation: { requested: null, materialized: 'MAP=row,BLOCK=256', ok: true, notes: [] },
    validity: { ok: true, reasons: [], partial: [] },
    protocol: { reps: 3, seed: 1, position: [0, 1, 0] },
    manifest: { codegen: 'kiln-codegen/1', app: '@kiln/workbench 0.1.0', userAgent: 'Chrome/141' },
  };
  patch(r);
  return { ...r, id: recordId(r) } as MeasurementRecord;
}
