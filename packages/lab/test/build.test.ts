// Ported from Perf Lab (PL/src/lang/build.test.ts). Perf Lab set the local host report in a module variable
// (setLocalReport); here each build takes the real host reports as an option, so the tests pass `hosts` instead.
import { describe, expect, it } from 'vitest';
import { buildSynthetic, BuildError, evaluateProgram, checkParam, decodeParam, encodeParam, paramKinds, materialize, readDerive, isValue, type HostReport, type RuntimeState } from '../src/index.ts';
import { readPresets } from '../src/node/index.ts';
import { hash, stableStringify } from '../src/lang/util.ts';

const PRESETS = readPresets();

const seedAndBuild = (source: string, params: Record<string, unknown> = {}, local: HostReport | null = null) =>
  buildSynthetic(source, { labId: 't', params, hosts: local ? { [local.host]: local } : {} });

const LOCAL_FIXTURE: HostReport = {
  host: 'mac',
  arch: 'arm64',
  cpu: { name: 'Test CPU', cores: 10, coreClasses: ['performance', 'efficiency'] },
  memoryBytes: null,
  gpu: { name: 'none', count: 0, precisions: [] },
  devices: ['cpu'],
  tools: { torch: '2.14.1', workloads: 'abc123def456' },
  threads: 8,
  counters: { unsupported: ['*'] },
  synthetic: false,
};

describe('presets', () => {
  // a capture's spec reaches the server as JSON, and the server names the job's runs by the hash of what it received
  it('every capture\'s lowered spec survives JSON and hashes to the capture\'s hash', () => {
    for (const preset of PRESETS) {
      const { ir } = seedAndBuild(preset.source, {}, LOCAL_FIXTURE);
      for (const c of ir.plan.captures) expect(hash(stableStringify(JSON.parse(JSON.stringify(c.lowered)))), `${preset.id} ${c.ref}`).toBe(c.hash);
    }
  });

  for (const preset of PRESETS) {
    it(`${preset.id} builds without errors`, () => {
      const { ir } = seedAndBuild(preset.source, {}, LOCAL_FIXTURE);
      const errors = ir.lint.filter((l) => l.level === 'error');
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
      expect(ir.plan.execute).toBe(0);
      expect(ir.passes.map((p) => p.name)).toEqual(['structure', 'expand · resolve', 'trace', 'validate', 'lower', 'plan']);
    });
  }
});

describe('hello', () => {
  it('reports the missing contract as lints', () => {
    const { ir } = seedAndBuild(PRESETS.find((p) => p.id === 'hello')!.source);
    const codes = ir.lint.map((l) => l.code);
    expect(codes).toContain('no-quality-gate');
    expect(codes).toContain('no-activation-rule');
    expect(codes).toContain('no-repetition');
  });
});

describe('parameters', () => {
  const src = PRESETS.find((p) => p.id === 'parameters')!.source;
  it('infers plan, data and view bindings from readers', () => {
    const { ir } = seedAndBuild(src);
    const binding = Object.fromEntries(ir.params.map((p) => [p.urlKey, p.binding]));
    expect(binding.host).toBe('plan');
    expect(binding['dino-warm.processes']).toBe('plan');
    expect(binding['dino-warm.precision']).toBe('plan');
    expect(binding.window).toBe('data');
    expect(binding.quantile).toBe('view');
    expect(binding.arms).toBe('view');
  });
  it('a plan-bound change produces captures to execute', () => {
    const { ir } = seedAndBuild(src, { 'dino-warm.processes': 12 });
    expect(ir.plan.execute).toBeGreaterThan(0);
  });
  it('a data-bound change recomputes the derive, transitively', () => {
    const { registry } = seedAndBuild(src);
    const all: RuntimeState = { params: {}, signals: {} };
    const narrow: RuntimeState = { params: { 'latency:window': [0, 4] }, signals: {} };
    const a = readDerive(registry, 'summary', all) as Record<string, { count: { value: number } }>[];
    const b = readDerive(registry, 'summary', narrow) as Record<string, { count: { value: number } }>[];
    expect(b[0]!.latency!.count.value).toBeLessThan(a[0]!.latency!.count.value);
  });
});

describe('scenario B accounting', () => {
  it('reports on-time throughput per process, never above the offered rate', () => {
    const { registry } = seedAndBuild(PRESETS.find((p) => p.id === 'scenario-b')!.source);
    const rows = readDerive(registry, 'throughput', { params: {}, signals: {} }) as Record<string, { value: number }>[];
    for (const r of rows) expect(r.requestsOnTime!.value).toBeLessThanOrEqual(6.5);
    const base = rows.find((r) => (r as unknown as { arm: string; phase: string }).arm === 'baseline' && (r as unknown as { phase: string }).phase === 'one-layout')!;
    expect(base.requestsOnTime!.value).toBeGreaterThan(4);
  });
});

describe('parameter codec', () => {
  it('round-trips ranges, checkboxes and multiselects', () => {
    const r = paramKinds.range({ min: 0, max: 120 });
    expect(encodeParam(r, [60, 120], [0, 120])).toBe('60..120');
    expect(decodeParam(r, '60..120', null)).toEqual({ ok: true, value: [60, 120] });
    expect(decodeParam(r, '90..30', null).ok).toBe(false);
    const c = paramKinds.checkbox();
    expect(encodeParam(c, false, true)).toBe('0');
    expect(decodeParam(c, 'yes', null).ok).toBe(false);
    const m = paramKinds.multiselect(['a', 'b,c']);
    expect(decodeParam(m, encodeParam(m, ['b,c'], [])!, [{ value: 'a', label: 'a' }, { value: 'b,c', label: 'b,c' }])).toEqual({ ok: true, value: ['b,c'] });
  });
  it('omits defaults and rejects invalid values without coercing', () => {
    const s = paramKinds.slider({ min: 2, max: 16, step: 1 });
    expect(encodeParam(s, 8, 8)).toBeNull();
    expect(checkParam(s, 40, null).ok).toBe(false);
    const p = paramKinds.pickRun('dino-warm/*/trace');
    expect(checkParam(p, 'dino-warm/candidate/trace#0', null).ok).toBe(true);
    expect(checkParam(p, 'emb-churn/candidate/trace#0', null).ok).toBe(false);
  });
});

describe('evaluation', () => {
  it('reports runtime errors with a lab.js line number', () => {
    try {
      evaluateProgram('const x = 1;\nconst y = 2;\nthrow new Error("boom");\nreturn lab("x");');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BuildError);
      expect((e as BuildError).failure.line).toBe(3);
    }
  });
  it('rejects a data lambda in a runner slot', () => {
    const { ir } = seedAndBuild(`return lab('x').experiment('e', e => e
      .workload(dino({ fixtures: 'f' })).baseline(rev('a')).candidate(rev('b'))
      .warmup(w => w.requests(4).until(r => r.activation.replay === 'hit'))
      .capture(capture.timing()));`);
    expect(ir.lint.map((l) => l.code)).toContain('lower-runner-slot');
  });
});

describe('scenario A evidence', () => {
  it('separates logical traffic, measured traffic and retained allocation', () => {
    const { registry } = seedAndBuild(PRESETS.find((p) => p.id === 'scenario-a')!.source);
    const rows = readDerive(registry, 'intermediate', { params: {}, signals: {} }) as Record<string, unknown>[];
    const cand = rows.find((r) => r.arm === 'candidate')!;
    const base = rows.find((r) => r.arm === 'baseline')!;
    expect(cand.logicalBytes).toBe(8 * 32 * 12240 * 16 * 4);
    expect(Number(cand.measuredTraffic)).toBeLessThan(Number(cand.logicalTraffic));
    expect(Number(cand.retained)).toBeGreaterThan(0);
    expect(isValue(base.retained) && (base.retained as { value: unknown }).value === null).toBe(true);
  });
  it('excludes the process whose fusion fell back', () => {
    const { registry } = seedAndBuild(PRESETS.find((p) => p.id === 'scenario-a')!.source);
    const est = readDerive(registry, 'speedup', { params: {}, signals: {} }) as { excluded: { rep: number }[]; pairs: unknown[] };
    expect(est.excluded.map((e) => e.rep)).toEqual([7]);
    expect(est.pairs).toHaveLength(7);
  });
  it('a route keeps its missing hops', () => {
    const { registry } = seedAndBuild(PRESETS.find((p) => p.id === 'request-to-kernel')!.source);
    const kernels = materialize(registry, registry.lab.boards[0]!.views[0]!.args[0], { params: {}, signals: {} });
    expect(Array.isArray(kernels)).toBe(true);
  });
});

describe('a Kiln host', () => {
  const local = PRESETS.find((p) => p.id === 'local-sampler')!.source;
  it('reports the host as unavailable without a probe report, instead of planning synthetic runs for it', () => {
    const { ir } = seedAndBuild(local, {}, null);
    expect(ir.lint.filter((l) => l.code === 'host-unavailable').map((l) => l.message)).toEqual([expect.stringMatching(/sampler-local: no capability report for host "mac"/)]);
  });

  it('puts the workload sources\' hash into each arm\'s revision, so editing a script changes the experiment', () => {
    const a = seedAndBuild(local, {}, LOCAL_FIXTURE).ir.plan.captures.map((c) => c.hash);
    const b = seedAndBuild(local, {}, { ...LOCAL_FIXTURE, tools: { ...LOCAL_FIXTURE.tools, workloads: 'fedcba654321' } }).ir.plan.captures.map((c) => c.hash);
    expect(a.length).toBe(8);
    expect(a.filter((h) => b.includes(h))).toEqual([]);
  });

  it('refuses a counter capture on a host without hardware counters', () => {
    const src = local.replace('.capture(capture.cpu()))', '.capture(capture.cpu())\n    .capture(capture.kernels()))');
    const { ir } = seedAndBuild(src, {}, LOCAL_FIXTURE);
    expect(ir.lint.filter((l) => l.code === 'capture-unsupported').map((l) => l.message)).toEqual(['sampler-local: mac exposes no hardware counters; capture.kernels() cannot run there']);
  });
});
