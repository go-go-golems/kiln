import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSource, contentId, sha256Hex } from '@kiln/evidence';
import { describe, expect, it } from 'vitest';
import { capabilities, kindById, modeCollectors, parseHosts, parseNcuCsv, planJob, probeRequest, type Facts, type HostProfile, type KernelInput, kilnKernels, parseGpuCsv, kilnIdentityOf, cyrb53, labCaptureHash, samplerEntities, stableStringify } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));

const PROFILE = {
  format: 'kiln-hosts/1',
  hosts: [{ id: 'spark', url: 'http://127.0.0.1:5281', environments: { 'kiln-perf': { image: 'kiln-perf:latest', docker: { gpus: 'all', network: 'none' } } }, toolMounts: { nsys: '/opt/nvidia/nsight-systems' } }],
};

const host = (): HostProfile => parseHosts(PROFILE).hosts[0]!;

function facts(o: { counters?: Facts['gpuCounters']; ncu?: boolean; nsys?: boolean; gpu?: boolean } = {}): Facts {
  return {
    format: 'kiln-facts/1', probedAt: '2026-10-20T00:00:00Z', driver: { api: 'kiln-driver/1', sha256: 'd'.repeat(64) },
    host: { hostname: 'spark-e220', kernel: '6.11', arch: 'aarch64', cpu: { model: 'Cortex-X925 + Cortex-A725', cores: 20 }, memBytes: 1, freeDiskBytes: 1e12, docker: '29.0', uid: 1000 },
    gpus: [{ index: 0, name: 'NVIDIA GB10', uuid: 'GPU-1', driver: '580.178.04', cc: '12.1', memMiB: 1, maxSmClockMHz: 1, persistence: 'Enabled' }],
    gpuCounters: o.counters ?? 'admin-only',
    environments: {
      'kiln-perf': {
        imageRef: 'kiln-perf:latest', image: `sha256:${'a'.repeat(64)}`, ok: true, gpuVisible: o.gpu ?? true,
        commands: { nvcc: { ok: true, version: '13.0' }, python: { ok: true, version: '3.12' } },
        modules: {},
        tools: { ncu: o.ncu ? { ok: true, bin: 'ncu', from: 'image', version: '2025.3' } : { ok: false, error: 'missing' }, nsys: o.nsys === false ? { ok: false, error: 'missing' } : { ok: true, bin: '/opt/nvidia/nsight-systems/bin/nsys', from: 'mount:/opt/nvidia/nsight-systems', version: '2025.5.1' } },
      },
    },
    conditions: { computeApps: [], containers: [] },
  };
}

function kernel(name = 'k_copy', seed = 11): KernelInput {
  const n = 16, block = 64;
  const source = `extern "C" __global__ void __launch_bounds__(${block}) ${name}(const float* __restrict__ src0, float* __restrict__ dst) {\n  int i = blockIdx.x * ${block} + threadIdx.x;\n  if (i < ${n}) dst[i] = src0[i];\n}\n`;
  const launch = { grid: 1, block, smem: 0 }, inputs = [{ shape: [n], seed }];
  const samples = Array.from({ length: n }, (_, i) => i);
  return {
    codegen: 'kiln-codegen/1', name, identity: `id-${name}`, row: 'MAP=row', knobs: { MAP: 'row' },
    contentId: contentId({ codegen: 'kiln-codegen/1', lang: 'cuda', sourceSha256: sha256Hex(canonicalSource(source, name)), launch, inputs, output: [n], target: null }),
    source, launch, inputs, output: [n], samples, expect: samples.map((i) => Math.fround(Math.sin(i))),
  };
}

const ASSET = new TextEncoder().encode('# runner\n');
const plan = (captures: unknown[], f = facts(), protocol = { reps: 3, launches: 5, warmup: 1, seed: 1 }) =>
  planJob({ job: 'job-1', host: host(), facts: f, kinds: kindById, protocol, captures, asset: () => ASSET });

describe('host profiles', () => {
  it('reads kiln-hosts/1 with defaults, and refuses a bad host without losing the others', () => {
    const r = parseHosts({ format: 'kiln-hosts/1', hosts: [...PROFILE.hosts, { id: 'Bad Host', url: 'x' }, { id: 'nossl', url: 'https://x', environments: { a: { image: 'i' } } }] });
    expect(r.hosts.map((h) => h.id)).toEqual(['spark']);
    expect(r.errors).toEqual([expect.stringMatching(/id must be lowercase/), expect.stringMatching(/must be http/)]);
    expect(r.hosts[0]).toMatchObject({ url: 'http://127.0.0.1:5281', lock: { waitSeconds: 1800 }, gpu: 0, toolMounts: { nsys: { mount: '/opt/nvidia/nsight-systems', bin: '/opt/nvidia/nsight-systems/bin/nsys' } } });
    expect(r.hosts[0]!.environments['kiln-perf']).toEqual({ image: 'kiln-perf:latest', python: 'python3', docker: { gpus: 'all', network: 'none', memory: null, shmSize: null }, threads: null });
    expect(parseHosts({ hosts: [] }).errors[0]).toMatch(/kiln-hosts\/1/);
  });

  it('asks the probe for every command, module and tool a requirement names, with tool mounts as candidates', () => {
    const req = probeRequest(host(), [{ command: 'nvcc' }, { module: 'numpy' }, { tool: 'nsys' }, { tool: 'ncu' }]);
    expect(req.environments['kiln-perf']).toMatchObject({
      commands: { nvcc: ['nvcc', '--version'], python: ['python3', '--version'] }, modules: ['numpy'], mounts: ['/opt/nvidia/nsight-systems'],
      tools: { ncu: [{ argv: ['ncu', '--version'], from: 'image' }], nsys: [{ argv: ['nsys', '--version'], from: 'image' }, { argv: ['/opt/nvidia/nsight-systems/bin/nsys', '--version'], from: 'mount:/opt/nvidia/nsight-systems' }] },
    });
  });
});

describe('offers', () => {
  it('derives kinds and collectors from facts, with the fixed reasons', () => {
    const caps = capabilities(host(), facts(), [kilnKernels as never]);
    expect(caps.offers.kinds).toEqual({ 'kiln-kernels/1': { environment: 'kiln-perf' } });
    expect(caps.offers.collectors['ncu']).toEqual({ blocked: 'kiln-perf has no ncu: build the image with it or add a tool mount' });
    expect(caps.offers.collectors['nsys']).toEqual({ kinds: ['kiln-kernels/1'] });
    expect(caps.offers.collectors['nvtx']).toEqual({ blocked: 'no registered kind cooperates with nvtx' });
    expect(capabilities(host(), facts({ ncu: true }), [kilnKernels as never]).offers.collectors['ncu']).toEqual({ blocked: 'GPU counters are restricted to administrators on spark (RmProfilingAdminOnly=1)' });
    expect(capabilities(host(), facts({ ncu: true, counters: 'all-users' }), [kilnKernels as never]).offers.collectors['ncu']).toEqual({ kinds: ['kiln-kernels/1'] });
    expect(capabilities(host(), facts({ gpu: false }), [kilnKernels as never]).offers.kinds['kiln-kernels/1']).toEqual({ blocked: 'no CUDA GPU is visible inside kiln-perf (nvidia-smi -L failed: unknown)' });
  });
});

describe('the planner', () => {
  it('groups by pairId, recomputes content ids, orders captures per repetition, stages the runner and the bundles', () => {
    const r = plan([kernel('k_a'), kernel('k_b', 12), kernel('k_c', 13)].map((input) => ({ kind: 'kiln-kernels/1', pairId: 'm1', mode: 'timing', input, rerun: true })));
    if (!r.ok) throw new Error(r.refusal.message);
    expect(r.verdicts.map((v) => v.verdict)).toEqual(['execute', 'execute', 'execute']);
    expect(r.groups).toHaveLength(1);
    expect(r.captures[0]!.collectors).toEqual(['cuda-events', 'gpu-sampler', 'ptxas']);
    const p = r.plan!;
    expect(p.steps.map((s) => s.id)).toEqual(['g0-r0-0', 'g0-r1-0', 'g0-r2-0']);
    expect(p.steps[0]).toMatchObject({ environment: 'kiln-perf', argv: ['python3', '/job/in/runner/kiln_runner.py', 'run', '/job/in/bundles/g0-r0.json', '--out', '/job/out/results.json'], wrap: [], sidecars: ['gpu-sampler'], mounts: [{ role: 'cache', source: 'kiln-kernels', target: '/job/cache', ro: false }] });
    expect(p.files.map((f) => f.path)).toEqual(['bundles/g0-r0.json', 'bundles/g0-r1.json', 'bundles/g0-r2.json', 'runner/kiln_runner.py']);
    expect(p.environments['kiln-perf']).toMatchObject({ image: `sha256:${'a'.repeat(64)}`, ref: 'kiln-perf:latest' });
    expect(p.gpu).toEqual({ index: 0, uuid: 'GPU-1' });
    const bundle = JSON.parse(new TextDecoder().decode(r.files.get('bundles/g0-r1.json')!));
    expect(bundle).toMatchObject({ format: 'kiln-bundle/1', reps: 5, warmup: 1 });
    expect(p.steps[1]!.serves.map((s) => r.captures.findIndex((c) => c.id === s.capture))).toEqual(bundle.kernels.map((k: { name: string }) => ['k_a', 'k_b', 'k_c'].indexOf(k.name)));
  });

  it('carries a u8 input to the runner\'s bundle; the content id ignores the dtype (the source names it)', () => {
    const k = kernel('k_u8');
    const u8 = { ...k, inputs: [{ ...k.inputs[0]!, dtype: 'u8' as const }] };
    const r = plan([{ kind: 'kiln-kernels/1', input: u8 }]);
    if (!r.ok) throw new Error(r.refusal.message);
    const bundle = JSON.parse(new TextDecoder().decode(r.files.get('bundles/g0-r0.json')!));
    expect(bundle.kernels[0].inputs).toEqual([{ size: 16, seed: 11, dtype: 'u8' }]);
    const f32 = plan([{ kind: 'kiln-kernels/1', input: k }]);
    if (!f32.ok) throw new Error(f32.refusal.message);
    expect(JSON.parse(new TextDecoder().decode(f32.files.get('bundles/g0-r0.json')!)).kernels[0].inputs).toEqual([{ size: 16, seed: 11 }]);
    const bad = plan([{ kind: 'kiln-kernels/1', input: { ...k, inputs: [{ ...k.inputs[0]!, dtype: 'f16' }] } }]);
    expect(bad.ok).toBe(false);
  });

  it('refuses a content id that does not match, naming the capture', () => {
    const bad = { ...kernel('k_b', 12), contentId: kernel('k_a').contentId };
    const r = plan([{ kind: 'kiln-kernels/1', input: kernel('k_a') }, { kind: 'kiln-kernels/1', input: bad }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toMatchObject({ status: 409, error: 'content_id_mismatch', extra: { capture: 1, name: 'k_b' } });
  });

  it('blocks counters with the reason, and a counters capture brings its timing companion', () => {
    const blocked = plan([{ kind: 'kiln-kernels/1', mode: 'counters', input: kernel() }]);
    if (!blocked.ok) throw new Error(blocked.refusal.message);
    expect(blocked.verdicts).toEqual([expect.objectContaining({ verdict: 'blocked', reason: 'kiln-perf has no ncu: build the image with it or add a tool mount' })]);
    expect(blocked.plan).toBeNull();

    const r = plan([{ kind: 'kiln-kernels/1', mode: 'counters', input: kernel() }], facts({ ncu: true, counters: 'all-users' }));
    if (!r.ok) throw new Error(r.refusal.message);
    expect(r.verdicts.map((v) => [v.index, v.mode, v.verdict])).toEqual([[0, 'counters', 'execute'], [null, 'timing', 'execute']]);
    expect(r.groups.map((g) => g.collectors.join(','))).toEqual(['gpu-sampler,ncu', 'cuda-events,gpu-sampler,ptxas']);
    const ncuStep = r.plan!.steps.find((s) => s.collectors.includes('ncu'))!;
    expect(ncuStep.wrap.slice(0, 7)).toEqual(['ncu', '--target-processes', 'all', '--csv', '--page', 'raw', '--metrics']);
    const ncuBundle = JSON.parse(new TextDecoder().decode(r.files.get(`bundles/${ncuStep.id.replace(/-0$/, '')}.json`)!));
    expect([ncuBundle.reps, ncuBundle.warmup]).toEqual([1, 0]);
  });

  it('wraps a timeline capture in nsys from the tool mount, with an export post-step', () => {
    const r = plan([{ kind: 'kiln-kernels/1', mode: 'timeline', input: kernel() }]);
    if (!r.ok) throw new Error(r.refusal.message);
    const s = r.plan!.steps[0]!;
    expect(s.wrap.slice(0, 2)).toEqual(['/opt/nvidia/nsight-systems/bin/nsys', 'profile']);
    expect(s.post).toEqual(['/opt/nvidia/nsight-systems/bin/nsys', 'export', '--type', 'sqlite', '--force-overwrite', 'true', '--output', '/job/out/trace.sqlite', '/job/out/trace.nsys-rep']);
    expect(s.mounts).toContainEqual({ role: 'tool', source: '/opt/nvidia/nsight-systems', target: '/opt/nvidia/nsight-systems', ro: true });
    expect(r.captures[0]!.environment.tools).toEqual({ nsys: { version: '2025.5.1', from: 'mount:/opt/nvidia/nsight-systems' } });
    expect(modeCollectors(kilnKernels as never, 'timeline')).toEqual(['gpu-sampler', 'nsys']);
  });

  it('gives the same capture the same id, and a changed image, protocol or collector set a new one', () => {
    const one = (f = facts(), protocol = { reps: 3, launches: 5, warmup: 1, seed: 1 }, mode = 'timing') => {
      const r = plan([{ kind: 'kiln-kernels/1', mode, input: kernel() }], f, protocol);
      if (!r.ok) throw new Error(r.refusal.message);
      return r.captures[0]!.id;
    };
    const a = one();
    expect(one()).toBe(a);
    const f = facts();
    f.environments['kiln-perf']!.image = `sha256:${'b'.repeat(64)}`;
    expect(one(f)).not.toBe(a);
    expect(one(facts(), { reps: 4, launches: 5, warmup: 1, seed: 1 })).not.toBe(a);
    expect(one(facts(), undefined, 'timeline')).not.toBe(a);
  });
});

describe('collector output', () => {
  it('reads ncu raw CSV: one row per launch, metrics renamed, duration in µs', () => {
    const csv = [
      '==PROF== Connected to process 12',
      '"ID","Process ID","Process Name","Host Name","Kernel Name","gpu__time_duration.sum","launch__registers_per_thread","l1tex__t_requests_pipe_lsu_mem_global_op_ld.sum","l1tex__t_sectors_pipe_lsu_mem_global_op_ld.sum"',
      '"","","","","","nsecond","register/thread","",""',
      '"0","12","harness","h","k_copy","2,048","32","4","16"',
    ].join('\n');
    expect(parseNcuCsv(csv)).toEqual([{ kernel: 'k_copy', counters: { ncu_duration_us: 2.048, ncu_registers: 32, ncu_ld_requests: 4, ncu_ld_sectors: 16, ncu_ld_sectors_per_req: 4 } }]);
  });

  it('reads the gpu-sampler series and the <name>__<identity> bridge', () => {
    expect(parseGpuCsv('2026/10/20 00:00:00.000, 5, 1980, 2619, 1, 70.0, 30\n2026/10/20 00:00:00.100, 7, 1980, 2619, 1, 71.5, 30\n')).toEqual([
      { t: Date.parse('2026-10-20T00:00:00.000Z'), utilizationPct: 5, smClockMHz: 1980, memClockMHz: 2619, memoryUsedMiB: 1, powerW: 70, temperatureC: 30 },
      { t: Date.parse('2026-10-20T00:00:00.100Z'), utilizationPct: 7, smClockMHz: 1980, memClockMHz: 2619, memoryUsedMiB: 1, powerW: 71.5, temperatureC: 30 },
    ]);
    expect(kilnIdentityOf('mask_post__3f0e2a91')).toBe('3f0e2a91');
    expect(kilnIdentityOf('ampere_sgemm_128x64')).toBeNull();
  });
});

describe('browser safety', () => {
  it('reaches only its own modules and @kiln/evidence', () => {
    const SPEC = /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g;
    const seen = new Set<string>(), bad: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of readFileSync(file, 'utf8').matchAll(SPEC)) {
        const s = m[1]!;
        if (s === '@kiln/evidence') continue;
        if (s.startsWith('./') || s.startsWith('../')) visit(resolve(dirname(file), s));
        else bad.push(`${file}: ${s}`);
      }
    };
    visit(resolve(here, '../src/index.ts'));
    expect(bad).toEqual([]);
  });
});

describe('capture identity (Perf Lab cyrb53)', () => {
  it('matches vectors computed with Perf Lab\'s own hash and stableStringify (PL/src/lang/util.ts)', () => {
    expect(cyrb53('')).toBe('bdcb81aee8d83');
    expect(cyrb53('a')).toBe('1c2ba782c97901');
    expect(cyrb53('hello', 7)).toBe('12779cb81098a8');
    expect(stableStringify({ b: 1, a: [1, 'x', null], c: { z: true, y: 'ü→' } })).toBe('{"a":[1,"x",null],"b":1,"c":{"y":"ü→","z":true}}');
    expect(labCaptureHash({})).toBe('1bc27f5a56d1e7');
    expect(labCaptureHash({ b: 1, a: [1, 'x', null], c: { z: true, y: 'ü→' } })).toBe('166d2fb354cb60');
    expect(labCaptureHash({ schema_version: 1, experiment_id: 'sampler-test', arm: 'baseline', host: 'local', workload: { adapter: 'sampler', queries: 64 }, collection: { mode: 'timing', requests: 3 } })).toBe('1a1c0ecec2f625');
    expect(labCaptureHash('plain')).toBe('75c3fd59f2249');
    expect(labCaptureHash([3, { k: 'v' }])).toBe('17bb778259fccd');
    expect(stableStringify({ a: undefined, __fn1: 'dropped' })).toBe('{"a":null}');
  });
});

describe('perf-lab-sampler/1', () => {
  const MAC = parseHosts({ format: 'kiln-hosts/1', hosts: [{ id: 'mac', url: 'http://127.0.0.1:5282', environments: { 'perf-lab-cpu': { image: 'perf-lab-cpu:latest', docker: { network: 'none' } } } }] }).hosts[0]!;
  const macFacts = (torch = true): Facts => ({
    format: 'kiln-facts/1', probedAt: '2026-10-20T00:00:00Z', driver: { api: 'kiln-driver/1', sha256: 'd'.repeat(64) },
    host: { hostname: 'mbp', kernel: '24.6.0', arch: 'arm64', cpu: { model: 'Apple M1 Pro', cores: 10 }, memBytes: 1, freeDiskBytes: 1e12, docker: '28.0', uid: 501 },
    gpus: [], gpuError: 'nvidia-smi: not found', gpuCounters: 'unknown',
    environments: { 'perf-lab-cpu': { imageRef: 'perf-lab-cpu:latest', image: `sha256:${'c'.repeat(64)}`, ok: true, gpuVisible: false, commands: { python: { ok: true, version: '3.12' } }, modules: { torch: torch ? { ok: true, version: '2.9.1' } : { ok: false, error: 'No module named torch' }, numpy: { ok: true, version: '2.3' } }, tools: {} } },
    conditions: { computeApps: [], containers: [] },
  });
  const spec = (arm: string, impl: string, mode = 'timing', extra: Record<string, unknown> = {}) => ({
    schema_version: 1, experiment_id: 'local-sampler', arm, host: 'mac', workload: { adapter: 'sampler', queries: 2048, device: 'cpu', dtype: 'float32' },
    comparison: { arm_revision: null, switches: { impl } }, state: null, warmup: null, expect: null, repeat: { processes: 3 }, collection: { mode, requests: 8 }, quality_gate_sha256: null, ...extra,
  });
  const req = (s: ReturnType<typeof spec>, labId = 'local-sampler') => ({ kind: 'perf-lab-sampler/1', mode: (s.collection as { mode: string }).mode, pairId: 'local-sampler', input: { labId, ref: `${s.experiment_id}/${s.arm}/${(s.collection as { mode: string }).mode}`, spec: s } });
  const files: Record<string, string> = { 'perf_lab_local/__init__.py': '', 'perf_lab_local/run.py': '# run\n', 'perf_lab_local/sampler.py': '# sampler\n' };
  const asset = (name: string) => new TextEncoder().encode(name === 'kiln_runner.py' ? '# runner\n' : files[name]!);
  const planMac = (captures: unknown[], f = macFacts(), a = asset) => planJob({ job: 'job-2', host: MAC, facts: f, kinds: kindById, protocol: { reps: 2, launches: 1, warmup: 0, seed: 1 }, captures, asset: a });

  it('runs one process per capture and repetition in perf-lab-cpu, with the mode from its collectors', () => {
    const r = planMac([req(spec('baseline', 'unfused', 'cpu')), req(spec('candidate', 'compiled', 'cpu'))]);
    if (!r.ok) throw new Error(r.refusal.message);
    expect(r.verdicts.map((v) => [v.verdict, v.mode, v.collectors.join(',')])).toEqual([['execute', 'cpu', 'rusage,wall-clock'], ['execute', 'cpu', 'rusage,wall-clock']]);
    expect(r.captures[0]!.device).toBe('cpu:arm64:Apple M1 Pro:10');
    const p = r.plan!;
    expect(p.gpu).toBeNull();
    expect(p.steps).toHaveLength(4);
    expect(p.steps[0]).toMatchObject({ environment: 'perf-lab-cpu', argv: ['python3', '-m', 'perf_lab_local.run', '--spec', expect.stringMatching(/^\/job\/in\/specs\/[0-9a-f]{64}\.json$/), '--rep', '0', '--out', '/job/out'], env: { PYTHONPATH: '/job/in/workload' }, sidecars: [] });
    expect(p.files.map((f) => f.path).filter((x) => x.startsWith('workload/'))).toEqual(['workload/perf_lab_local/__init__.py', 'workload/perf_lab_local/run.py', 'workload/perf_lab_local/sampler.py']);
    const staged = JSON.parse(new TextDecoder().decode(r.files.get(`specs/${r.captures[0]!.id}.json`)!));
    expect(staged.collection).toEqual({ mode: 'cpu', requests: 8 });
  });

  it('names its runs by the lab: cyrb53 of the spec, the experiment/arm/mode ref', () => {
    const s = spec('baseline', 'unfused');
    const r = planMac([req(s)]);
    if (!r.ok) throw new Error(r.refusal.message);
    expect(kindById.get('perf-lab-sampler/1')!.lab!(r.captures[0]!)).toEqual({ labId: 'local-sampler', hash: labCaptureHash(s), ref: 'local-sampler/baseline/timing' });
  });

  it('keeps the content id across host names and repetition counts, and changes it with the workload or the spec', () => {
    const id = (s: ReturnType<typeof spec>, a = asset) => { const r = planMac([req(s)], macFacts(), a); if (!r.ok) throw new Error(r.refusal.message); return r.captures[0]!.contentId; };
    const base = id(spec('baseline', 'unfused'));
    expect(id({ ...spec('baseline', 'unfused'), host: 'local', repeat: { processes: 9 } })).toBe(base);
    expect(id(spec('baseline', 'unfused', 'timing', { workload: { adapter: 'sampler', queries: 4096, device: 'cpu', dtype: 'float32' } }))).not.toBe(base);
    expect(id(spec('baseline', 'unfused'), (n) => (n === 'perf_lab_local/run.py' ? new TextEncoder().encode('# run v2\n') : asset(n)))).not.toBe(base);
  });

  it('refuses a spec its ref does not name, and is blocked without torch', () => {
    const bad = planMac([{ ...req(spec('baseline', 'unfused')), input: { labId: 'x', ref: 'local-sampler/candidate/timing', spec: spec('baseline', 'unfused') } }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.refusal.message).toMatch(/does not name the spec/);
    const r = planMac([req(spec('baseline', 'unfused'))], macFacts(false));
    if (!r.ok) throw new Error(r.refusal.message);
    expect(r.verdicts[0]).toMatchObject({ verdict: 'blocked', reason: expect.stringMatching(/torch/) });
  });

  it('imports timing and getrusage into requests and an instant; a failed process makes the run invalid', () => {
    const json = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
    const s = spec('baseline', 'unfused', 'cpu');
    const r = planMac([req(s)]);
    if (!r.ok) throw new Error(r.refusal.message);
    const c = r.captures[0]!, step = r.plan!.steps[0]!;
    const out = (exit: number) => ({
      step, log: 'Traceback\nRuntimeError: boom', execution: { id: step.id, exit, seconds: 2 },
      files: new Map([
        ['manifest.json', json({ mode: 'cpu', arm: 'baseline', impl: 'unfused', device: 'cpu', dtype: 'float32', threads: 4, shape: { queries: 2048, heads: 8, channels: 32, points: 4, spatial: 64 }, torch: '2.9.1', python: '3.12.12', numpy: '2.3.5', workload_sha256: 'w', started_at: '2026-10-20T20:00:00+0000' })],
        ['activation.json', json({ impl: 'unfused', executed: 'unfused', intermediate: 'materialized' })],
        ['quality.json', json({ reference: 'unfused', maxAbsDiff: 0, tolerance: 1e-5, pass: true })],
        ['timing.json', json({ requests: [{ i: 0, start_ns: 0, end_ns: 2e6, cpu_ns: 1.9e6 }, { i: 1, start_ns: 2.1e6, end_ns: 4.6e6, cpu_ns: 2.4e6 }] })],
        ['cpu.json', json({ window_ns: 4.7e6, delta: { ru_utime: 0.01, ru_stime: 0.002, ru_nvcsw: 3, ru_nivcsw: 1, ru_minflt: 40, ru_majflt: 0, ru_inblock: 0, ru_oublock: 0 }, maxrss_bytes: 3e8, scope: 'process (all threads) over the measured window' })],
      ]),
    });
    const ctx = { job: 'job-2', captures: new Map([[c.id, c]]) };
    const [o] = kindById.get('perf-lab-sampler/1')!.import(out(0), ctx);
    if (o?.type !== 'entities') throw new Error('no entities');
    expect(o.entities.filter((e) => e.kind === 'request').map((e) => [e.id, e.latency])).toEqual([['r0-000', 2], ['r0-001', 2.5]]);
    expect(o.entities.find((e) => e.id === 'rusage')).toMatchObject({ userTime: { value: 10, prov: 'observed', unit: 'ms' } });
    expect(o.run).toMatchObject({ validity: { ok: true }, requests: 2, durationS: 0.0046, manifest: { toolchain: 'torch 2.9.1 · python 3.12.12 · numpy 2.3.5', specHash: labCaptureHash(s), threads: 4 } });
    const [bad] = kindById.get('perf-lab-sampler/1')!.import(out(1), ctx);
    expect(bad?.type === 'entities' && bad.run).toMatchObject({ validity: { ok: false, reasons: ['process exited with 1: RuntimeError: boom'] } });
  });

  it('imports a torch.profiler trace: requests, ranges and outermost operators, linked', () => {
    const t = { traceEvents: [
      { ph: 'X', cat: 'user_annotation', name: 'request#0', ts: 100, dur: 50, tid: 1 },
      { ph: 'X', cat: 'user_annotation', name: 'compiled_forward', ts: 101, dur: 40, tid: 1 },
      { ph: 'X', cat: 'cpu_op', name: 'aten::grid_sampler_2d', ts: 102, dur: 30, tid: 1, args: { 'Input Dims': [[1, 2]] } },
      { ph: 'X', cat: 'cpu_op', name: 'aten::empty', ts: 103, dur: 1, tid: 1 },
    ] };
    const o = samplerEntities({ read: (n) => (n === 'trace.json' ? t : n === 'manifest.json' ? { mode: 'trace', arm: 'baseline' } : undefined), capture: 'c', rep: 1, exit: 0 });
    expect(o.entities.map((e) => `${e.kind}:${e.id}`)).toEqual(['request:r1-000', 'span:r1-000-compiled_forward-0', 'kernel:r1-000-k0000']);
    expect(o.entities[2]).toMatchObject({ role: 'encoder.sampling', dur: 0.03, lane: 'cpu:main' });
    expect(o.links).toEqual([
      { from: 'request:r1-000', to: 'span:r1-000-compiled_forward-0', rel: 'contains', evidence: 'direct', method: 'record_function nesting' },
      { from: 'span:r1-000-compiled_forward-0', to: 'kernel:r1-000-k0000', rel: 'launches', evidence: 'direct', method: 'torch.profiler nesting' },
    ]);
  });

  it('leaves kiln-kernels/1 timing as CUDA events, and has no cpu mode for it', () => {
    expect(modeCollectors(kindById.get('kiln-kernels/1')!, 'timing')).toEqual(['cuda-events', 'gpu-sampler', 'ptxas']);
    expect(modeCollectors(kindById.get('kiln-kernels/1')!, 'cpu')).toBeNull();
    expect(modeCollectors(kindById.get('perf-lab-sampler/1')!, 'memory')).toEqual(['torch-memory', 'torch-profiler']);
  });
});
