import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDataset } from './datasets';
import { openDb } from './db';
import { archiveFile, registerArchive } from './evidence';
import { durationMs, importQualification, kernelRole, parseJunit, parseProfilerTable, reportsFor } from './qualification';

describe('report parsers', () => {
  it('reads profiler durations, tables and JUnit outcomes', () => {
    expect([durationMs('20.057ms'), durationMs('956.750us'), durationMs('1.5s'), durationMs('n/a')]).toEqual([20.057, 0.95675, 1500, null]);
    const table = [
      '-------------  ------------  ------------  ------------',
      '         Name     Self CUDA   Self CUDA %    # of Calls',
      '-------------  ------------  ------------  ------------',
      'fused_sampling     17.222ms        12.21%            18',
      '  cutlass_gemm     20.057ms        14.22%           444',
      '-------------  ------------  ------------  ------------',
      'Self CPU time total: 148.386ms',
      'Self CUDA time total: 141.059ms',
    ].join('\n');
    const t = parseProfilerTable(table);
    expect(t.rows.map((r) => [r.Name, r['# of Calls']])).toEqual([['fused_sampling', '18'], ['cutlass_gemm', '444']]);
    expect(t.totals).toEqual({ cpu: 148.386, cuda: 141.059 });
    const xml = '<testsuite><testcase classname="a" name="ok" time="1.5" /><testcase classname="a" name="bad" time="2"><failure message="x"/></testcase><testcase classname="b" name="skip" time="0"><skipped/></testcase></testsuite>';
    expect(parseJunit(xml).map((c) => [c.suite, c.name, c.outcome])).toEqual([['a', 'ok', 'passed'], ['a', 'bad', 'failed'], ['b', 'skip', 'skipped']]);
  });

  it('names kernel roles by Inductor prefix before the fused operation names', () => {
    expect(['fused_sampling', 'triton_poi_fused__to_copy_addmm_relu_view_2', 'triton_per_fused__softmax__to_copy_addmm_exp_grid_sa', 'void cutlass::Kernel2<cutlass_80_tensorop_f16_s16816gemm>', 'Memcpy HtoD'].map(kernelRole)).toEqual([
      'encoder.sampling', 'pointwise', 'reduction', 'matmul', 'copy',
    ]);
  });

  it('chooses reports by mode, state and variant, and honours an override', () => {
    expect(reportsFor({}, 'timing', 'baseline')).toEqual(['paired.json', 'paired-repeat.json']);
    expect(reportsFor({ collection: { states: ['cold', 'warm'] } }, 'memory', 'candidate')).toEqual(['cold-candidate.json', 'warm-candidate.json']);
    expect(reportsFor({ evidence: { reports: { timing: ['changing-prompt-diagnostic.json'] } } }, 'timing', 'reuse')).toEqual(['changing-prompt-diagnostic.json']);
  });
});

const DGX = join(homedir(), 'code/tulip/playback-vault/Projects/2026/10/12/_assets/pr1005-dgx-20261012/evidence-final.tar.gz');

describe.skipIf(!existsSync(DGX))('importing the PR 1005 DGX archive', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'perf-lab-qual-'));
  const db = openDb(':memory:');
  const { archive } = registerArchive(db, dataDir, readFileSync(DGX), 'pr1005-dgx-20261012');
  const dataset = getDataset(db, archive.datasets[0])!;
  const imp = (arm: string, mode: string, spec: Record<string, unknown> = {}) =>
    importQualification({
      read: (p) => archiveFile(db, dataDir, archive.sha256, p),
      source: `evidence:${archive.sha256}`,
      reportsDir: 'qualification/reports/',
      spec: { workload: { adapter: 'dino', dataset_sha256: dataset.id }, comparison: { arm_revision: arm === 'baseline' ? 'a6f14d947' : 'd59d9ad' }, quality_gate_sha256: 'gate', ...spec },
      hash: `h-${arm}-${mode}`,
      ref: `pr1005-dgx/${arm}/${mode}`,
      host: 'playback@dgx',
      dataset,
    });

  it('imports both paired timing reports per arm with exact digests', () => {
    const [first, repeat] = imp('candidate', 'timing', { expect: { expect: { replay: 'active' }, arm: 'candidate' } });
    expect(first.entities.filter((e) => e.kind === 'request')).toHaveLength(256);
    expect(repeat.run.ref).toBe('pr1005-dgx/candidate/timing#1');
    const r = first.entities.find((e) => e.id === '1993-p0')!;
    expect(r).toMatchObject({ image: 1993, latency: 52.73238895460963, exact: true, digest: '0d0e5cba5a2c900dfab4412405b59e4df777951754ff4e943ceb19feceaa1f0d' });
    expect(first.run).toMatchObject({ validity: { ok: true }, activation: { replay: 'active', fusion: 'not recorded in this report' }, quality: { status: 'qualified', exact: true } });
    expect(first.run.manifest).toMatchObject({ device: 'NVIDIA GB10 (aarch64)', precision: 'fp16', inputSize: '768 × 768 letterbox', model: 'IDEA-Research/grounding-dino-tiny @ a2bb814dd30d' });
    const [baseline] = imp('baseline', 'timing');
    expect(baseline.entities.find((e) => e.id === '1993-p1')).toMatchObject({ latency: 76.79475238546729, exact: true });
    expect(baseline.run.activation).toMatchObject({ replay: 'absent (original source)' });
  });

  it('imports one memory run per state with four separate pools', () => {
    const runs = imp('candidate', 'memory');
    expect(runs.map((b) => b.run.manifest && (b.run.manifest as Record<string, unknown>).state)).toEqual(['cold', 'warm', 'warm-repeat']);
    const warm = runs[1].entities.find((e) => e.kind === 'instant')!;
    expect(warm).toMatchObject({ type: 'memory.peaks', state: 'warm', cgroup: { value: 2313895936, unit: 'B' } });
    expect(runs[1].entities.filter((e) => e.kind === 'request')).toHaveLength(12);
  });

  it('imports stage spans, predictions with verdicts and ground truth, kernels and tests', () => {
    const [stages] = imp('candidate', 'stages');
    expect(stages.entities.filter((e) => e.kind === 'request')).toHaveLength(128);
    expect(stages.entities.filter((e) => e.kind === 'span' && e.request === '1993-p0').map((s) => s.name)).toEqual([
      'decode_rgb', 'letterbox', 'cached_tokenization', 'normalize_transfer_and_mask', 'model_forward', 'postprocess_including_cpu_transfers_and_phrase_decode', 'extract_detections',
    ]);
    expect(stages.run.activation).toEqual({ replay: 'active', fusion: 'active' });

    const [pred] = imp('candidate', 'predictions');
    const chair = pred.entities.find((e) => e.kind === 'detection' && e.image === 1993 && e.label === 'chair')!;
    expect(chair).toMatchObject({ confidence: 0.715225100517273, status: 'exact', counterpart: expect.stringMatching(/^pr1005-dgx\/baseline\/predictions#0!detection:1993-\d$/), truthKnown: true });
    expect(new Set(pred.entities.map((e) => e.image)).size).toBe(16);
    expect(pred.entities.filter((e) => e.kind === 'detection').every((e) => e.status === 'exact')).toBe(true);
    expect(pred.entities.find((e) => e.id === 'image-1993')).toMatchObject({ type: 'predictions.image', detections: 2, truth: 2 });
    expect(pred.run.coverage).toMatchObject({ complete: false, notes: ['predictions recorded for 16 images of 128; other images have output digests only'] });

    const [kernels] = imp('candidate', 'kernels');
    expect(kernels.entities.find((e) => e.name === 'fused_sampling')).toMatchObject({ calls: 18, selfCuda: 17.222, selfCudaPct: 12.21, role: 'encoder.sampling' });
    const [noKernels] = imp('baseline', 'kernels');
    expect(noKernels.entities).toEqual([]);
    expect(noKernels.run.coverage).toMatchObject({ complete: false, notes: [expect.stringMatching(/candidate only/)] });

    const [tests] = imp('candidate', 'tests');
    expect(tests.entities.filter((e) => e.kind === 'check')).toHaveLength(39);
    expect(new Set(tests.entities.map((e) => e.ref)).size).toBe(39);
    expect(tests.entities[0]).toMatchObject({ suite: 'tests.test_grounding_dino_upgrade', name: 'test_full_labeled_subset_preserves_detections_with_acceptance_active'.replace('acceptance', 'acceleration') });
    expect(tests.entities.every((e) => e.outcome === 'passed')).toBe(true);
  });

  it('imports the changing-prompt diagnostic as a timing capture of its own experiment', () => {
    const spec = { evidence: { reports: { timing: ['changing-prompt-diagnostic.json'] } } };
    const reuse = importQualification({
      read: (p) => archiveFile(db, dataDir, archive.sha256, p), source: `evidence:${archive.sha256}`, reportsDir: 'qualification/reports/',
      spec: { ...spec, comparison: { switches: { variant: 'reuse' } } }, hash: 'h', ref: 'pr1005-prompt-policy/reuse/timing', host: 'playback@dgx', dataset,
    })[0];
    expect(reuse.entities.filter((e) => e.kind === 'request')).toHaveLength(80);
    expect(reuse.entities.find((e) => e.kind === 'instant')).toMatchObject({ captures: { value: 0 } });
    expect(reuse.run.activation).toMatchObject({ replay: 'active', replayKey: 'layout' });
    expect(reuse.entities.filter((e) => e.kind === 'request').every((e) => e.exact === true)).toBe(true);
  });
});

describe.skipIf(!existsSync(DGX))('an evidence job', () => {
  it('imports approved evidence-backed captures and lists them as measured with their archive as source', async () => {
    const { createApp } = await import('./app');
    const { loadConfig } = await import('./config');
    const { EventBus } = await import('./events');
    const { Runner } = await import('./runner');
    const { hash, stableStringify } = await import('../src/lang/util');
    const dataDir = mkdtempSync(join(tmpdir(), 'perf-lab-job-'));
    const db = openDb(':memory:');
    const bus = new EventBus();
    const runner = new Runner(db, bus, {}, { dataDir });
    const app = createApp({ config: loadConfig({ dataDir }), db, bus, runner, probe: () => undefined, startedAt: 'now' });
    const { archive } = registerArchive(db, dataDir, readFileSync(DGX), 'pr1005-dgx-20261012');
    const capture = (arm: string, mode: string, reps: number) => {
      const spec = { schema_version: 1, experiment_id: 'pr1005-dgx', arm, host: 'playback@dgx', workload: { adapter: 'dino', dataset_sha256: archive.datasets[0] }, collection: { mode }, evidence: { archive_sha256: archive.sha256, format: 'detection-qualification/v1', reports: null } };
      return { hash: hash(stableStringify(spec)), ref: `pr1005-dgx/${arm}/${mode}`, host: 'playback@dgx', reps, spec };
    };
    const captures = [capture('baseline', 'timing', 2), capture('candidate', 'timing', 2), capture('candidate', 'predictions', 1)];
    const seeded = await app.request('/api/labs/l/seed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captures }) });
    expect(await seeded.json()).toEqual({ seeded: 0 }); // never synthetic stand-ins
    const job = await app.request('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ labId: 'l', captures, reason: 'import', approve: true }) });
    expect(job.status).toBe(201);
    await runner.idle();
    const catalog = (await (await app.request('/api/catalog')).json()) as Record<string, { origin: string; source: string }>;
    expect(captures.map((c) => catalog[c.hash])).toEqual(captures.map(() => expect.objectContaining({ origin: 'measured', source: `evidence:${archive.sha256}` })));
    const bundles = (await (await app.request(`/api/bundles?hashes=${captures[1].hash}`)).json()) as Record<string, { run: { ref: string } }[]>;
    expect(bundles[captures[1].hash].map((b) => b.run.ref)).toEqual(['pr1005-dgx/candidate/timing#0', 'pr1005-dgx/candidate/timing#1']);

    const wrong = capture('candidate', 'memory', 1); // the archive has three memory states
    const failed = await app.request('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ labId: 'l', captures: [wrong], reason: 'import', approve: true }) });
    await runner.idle();
    const j = (await (await app.request(`/api/jobs/${((await failed.json()) as { id: string }).id}`)).json()) as { status: string; error: string };
    expect(j).toMatchObject({ status: 'failed', error: 'pr1005-dgx/candidate/memory: the archive provides 3 repetitions, the plan expects 1' });
  });
});
