import { join } from 'node:path';
import { contentId, deviceId, recordId, sha256Hex, type MeasurementRecord } from '@kiln/evidence';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.ts';
import { insertRecords, listRecords } from '../src/records.ts';
import { makeServer, tempDir } from './support/server.ts';

const WGSL = '@compute @workgroup_size(256) fn kernel() {}';
const FP = { vendor: 'apple', architecture: 'metal-3', description: 'Apple M3 Max', timestamps: true };

/** A complete, valid WebGPU record; `patch` edits it before the id is computed. */
function record(patch: (r: Omit<MeasurementRecord, 'id'>) => void = () => {}): MeasurementRecord {
  const launch = { grid: 4096, block: 256, smem: 0 };
  const r: Omit<MeasurementRecord, 'id'> = {
    format: 'kiln-measure/1', at: '2026-10-19T15:00:00.000Z', by: 'measure',
    device: { id: deviceId('webgpu', 'Apple M3 Max', FP), class: 'webgpu', name: 'Apple M3 Max', fingerprint: { ...FP } },
    kernel: {
      name: 'rms_norm', identity: 'a1b2c3', row: 'MAP=row', knobs: { MAP: 'row' },
      contentId: contentId({ codegen: 'kiln-codegen/1', lang: 'wgsl', sourceSha256: sha256Hex(WGSL), launch, inputs: [{ shape: [4096, 4096], seed: 7 }], output: [4096, 4096], target: null }),
      lang: 'wgsl', sourceSha256: sha256Hex(WGSL), launch,
    },
    timing: { kind: 'gpu-timestamp', unit: 'us', samples: [101.5, 99.8, 100.2], launches: 20, warmup: 3 },
    check: { ok: true, sampled: 512, maxAbsErr: 1e-6 },
    activation: { requested: null, materialized: 'MAP=row', ok: true, notes: [] },
    validity: { ok: true, reasons: [], partial: [] },
    protocol: { reps: 3, seed: 1, position: [0, 1, 0] },
    manifest: { codegen: 'kiln-codegen/1', app: 'kiln-workbench/0.1' },
  };
  patch(r);
  return { ...r, id: recordId(r) } as MeasurementRecord;
}

describe('records (guide §30.3)', () => {
  it('stores valid records once, and lists them by device, identity and time', async () => {
    const s = makeServer();
    const a = record(), b = record((r) => { r.at = '2026-10-19T16:00:00.000Z'; r.kernel.identity = 'other'; });
    const first = await s.json('POST', '/api/records', { body: { records: [a, b] } });
    expect(first).toEqual({ status: 200, body: { added: 2, duplicates: 0, rejected: [] } });
    const again = await s.json('POST', '/api/records', { body: { records: [a] } });
    expect(again.body).toEqual({ added: 0, duplicates: 1, rejected: [] });

    expect((await s.json('GET', '/api/records')).body.records.map((r: MeasurementRecord) => r.id)).toEqual([a.id, b.id]);
    expect((await s.json('GET', `/api/records?device=${a.device.id}&identity=other`)).body.records).toEqual([b]);
    expect((await s.json('GET', '/api/records?since=2026-10-19T15:30:00Z')).body.records.map((r: MeasurementRecord) => r.id)).toEqual([b.id]);
    expect((await s.json('GET', '/api/records?since=yesterday')).status).toBe(400);
  });

  it('rejects a record whose content does not hash to its id, and a malformed one, keeping the rest', async () => {
    const s = makeServer();
    const good = record();
    const tampered = { ...structuredClone(good), timing: { ...good.timing, samples: [1, 1, 1] } };
    const lying = record((r) => { r.validity = { ok: true, reasons: [], partial: [] }; r.check = { ok: false, sampled: 512 }; });
    const r = await s.json('POST', '/api/records', { body: { records: [tampered, { format: 'kiln-measure/1' }, lying, good, 42] } });
    expect(r.body.added).toBe(1);
    expect(r.body.rejected).toHaveLength(4);
    expect(r.body.rejected[0]).toEqual({ id: good.id, reason: expect.stringMatching(/^id: expected [0-9a-f]{64}/) });
    expect(r.body.rejected[1].id).toBeNull();
    expect(r.body.rejected[2].reason).toMatch(/validity\.ok: true, but the output check failed/);
    expect((await s.json('GET', '/api/records')).body.records).toEqual([good]);
  });

  it('refuses a body that is not {records: [...]}', async () => {
    const s = makeServer();
    expect((await s.json('POST', '/api/records', { body: [record()] })).body.error).toBe('bad_request');
    expect((await s.json('POST', '/api/records', { body: { records: Array.from({ length: 10_001 }, () => 0) } })).body.error).toBe('limit_exceeded');
  });

  it('forgets a device: its records and its row', async () => {
    const s = makeServer();
    const a = record();
    await s.json('POST', '/api/records', { body: { records: [a, record((r) => { r.at = '2026-10-19T17:00:00.000Z'; })] } });
    const [dev] = (await s.json('GET', '/api/devices')).body.devices;
    expect(dev).toMatchObject({ id: a.device.id, class: 'webgpu', name: 'Apple M3 Max', fingerprint: FP, host: null, records: 2, firstSeen: '2026-10-19T15:00:00.000Z', lastSeen: '2026-10-19T17:00:00.000Z' });
    expect((await s.json('DELETE', '/api/records')).status).toBe(400);
    expect((await s.json('DELETE', `/api/records?device=${encodeURIComponent(a.device.id)}`)).body).toEqual({ deleted: 2 });
    expect((await s.json('GET', '/api/devices')).body.devices).toEqual([]);
  });

  it('persists across processes: records written by one server are read by the next', () => {
    const file = join(tempDir(), 'kiln.sqlite');
    const one = openDb(file);
    expect(insertRecords(one, [record()]).added).toBe(1);
    one.close();
    const two = openDb(file);
    expect(listRecords(two)).toEqual([record()]);
    two.close();
  });
});
