// Real-shaped data: the local sampler's measured timing and memory runs, extracted once from Perf Lab's store by
// scripts/extract-fixtures.ts into test/fixtures/local-sampler-q2048.json. The expected numbers are what Perf Lab's
// own code computed from the same runs (Phase 8a diary, Step 1 baseline); the port must reproduce them exactly.
import { describe, expect, it } from 'vitest';
import { build, createMemoryLabData, evaluateHypothesis, labEnv, readDerive, type BundleJSON, type HostReport, type PairedRatioResult, type Value } from '../src/index.ts';
import { PERF_LAB_SAMPLER } from './fixtures/perf-lab-sampler.ts';
import fixture from './fixtures/local-sampler-q2048.json' with { type: 'json' };

const state = { params: {}, signals: {} };
const data = createMemoryLabData({
  catalog: fixture.catalog as never,
  bundles: fixture.bundles as unknown as Record<string, BundleJSON[]>,
  hostReports: { local: fixture.localReport as HostReport },
});
const { ir, registry } = build({ source: PERF_LAB_SAMPLER, labId: 'local-sampler', params: {}, env: labEnv(data) });

describe('the local sampler, measured', () => {
  it('finds its timing and memory captures under the hashes Perf Lab stored them by', () => {
    const cached = ir.plan.captures.filter((c) => c.status === 'cached').map((c) => c.hash).sort();
    expect(cached).toEqual(Object.keys(fixture.catalog).sort());
    // trace and cpu were not extracted, so the plan would execute them
    expect(ir.plan.captures.filter((c) => c.status === 'execute').map((c) => c.mode).sort()).toEqual(['cpu', 'cpu', 'trace', 'trace']);
  });

  it('reproduces Perf Lab’s latency quantiles', () => {
    const rows = readDerive(registry, 'latency', state) as { arm: string; latency: Record<string, Value>; cpuTime: Record<string, Value> }[];
    const by = Object.fromEntries(rows.map((r) => [r.arm, r]));
    expect(by.baseline!.latency.count!.value).toBe(128);
    expect(by.baseline!.latency.p50!.value).toBe(5.170916500000001);
    expect(by.baseline!.latency.p95!.value).toBe(6.041627299999999);
    expect(by.baseline!.latency.max!.value).toBe(9.166167);
    expect(by.baseline!.cpuTime.p50!.value).toBe(4.7130205);
    expect(by.candidate!.latency.p50!.value).toBe(12.8777915);
    expect(by.candidate!.latency.p95!.value).toBe(18.68385395);
    expect(by.candidate!.latency.p50!.prov).toBe('derived');
  });

  it('reproduces Perf Lab’s paired ratio and bootstrap interval bit for bit, and says how little four processes support', () => {
    const est = readDerive(registry, 'speedup', state) as PairedRatioResult;
    expect(est.pairs).toEqual([
      { rep: 0, baseline: 5.2482500000000005, candidate: 13.1905, ratio: 2.513313961796789 },
      { rep: 1, baseline: 5.22925, candidate: 12.416521, ratio: 2.3744362958359226 },
      { rep: 2, baseline: 5.162395500000001, candidate: 12.8005625, ratio: 2.47957803697915 },
      { rep: 3, baseline: 5.0778755, candidate: 13.817625, ratio: 2.721142926800785 },
    ]);
    expect(est.median.value).toBe(2.4964459993879693);
    expect(est.ci.map((v) => v.value)).toEqual([2.3744362958359226, 2.721142926800785]);
    expect(est.caveat).toBe('n = 4: the interval is bounded by the sample range');
    expect(est.median.prov).toBe('derived');
  });

  it('refutes compile-removes-intermediate, as Perf Lab did, on the candidate’s one intermediate-sized block', () => {
    expect(readDerive(registry, 'blocks', state)).toEqual([
      { arm: 'baseline', blocks: 3, intermediateSized: 2, largest: 33554432, allocatedIn: 'aten::empty, aten::mul' },
      { arm: 'candidate', blocks: 2, intermediateSized: 1, largest: 33554432, allocatedIn: 'Torch-Compiled Region: 0/0' },
    ]);
    const v = evaluateHypothesis(registry, state, 'compile-removes-intermediate');
    expect(v.verdict).toBe('refuted');
    expect(v.checks.map((c) => c.pass)).toEqual([false]);
    expect(v.support.map((s) => [s.count, s.runs.length, s.invalid])).toEqual([[15, 2, []], [2, 0, []]]);
  });

  it('keeps measured values observed', () => {
    const run = registry.source.runs('sampler-local/baseline/timing#0')[0]!;
    expect(run.measured).toBe(true);
    expect(run.synthetic).toBe(false);
  });
});
