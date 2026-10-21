import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSource, contentId, sha256Hex } from '@kiln/evidence';
import { describe, expect, it } from 'vitest';
import { capabilities, kindById, modeCollectors, parseHosts, parseNcuCsv, planJob, probeRequest, type Facts, type HostProfile, type KernelInput, kilnKernels, parseGpuCsv, kilnIdentityOf } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));

const PROFILE = {
  format: 'kiln-hosts/1',
  hosts: [{ id: 'spark', url: 'http://127.0.0.1:5281', environments: { 'kiln-perf': { image: 'kiln-perf:latest', docker: { gpus: 'all', network: 'none' } } }, toolMounts: { nsys: '/opt/nvidia/nsight-systems' } }],
};

const host = (): HostProfile => parseHosts(PROFILE).hosts[0]!;

function facts(o: { counters?: Facts['gpuCounters']; ncu?: boolean; nsys?: boolean; gpu?: boolean } = {}): Facts {
  return {
    format: 'kiln-facts/1', probedAt: '2026-10-20T00:00:00Z', driver: { api: 'kiln-driver/1', sha256: 'd'.repeat(64) },
    host: { hostname: 'spark-e220', kernel: '6.11', arch: 'aarch64', memBytes: 1, freeDiskBytes: 1e12, docker: '29.0', uid: 1000 },
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
