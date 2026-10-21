import type { AdapterContract, Capabilities } from '../lang/env.ts';

/**
 * Synthetic capability reports. Shapes follow the intern guide §7.1; the values are placeholders for the
 * read-only capability probe that will run on the real hosts.
 */
const HOSTS: Record<string, Omit<Capabilities, 'gpu'> & { gpu: Omit<Capabilities['gpu'], 'supports' | 'peak'> & { precisions: string[]; peakTflops: Record<string, number>; dramGBs: number; l2GBs: number } }> = {
  'playback@dgx': {
    host: 'playback@dgx',
    arch: 'arm64',
    gpu: { name: 'NVIDIA GB10 (synthetic)', count: 1, precisions: ['fp32', 'fp16', 'bf16'], peakTflops: { fp32: 31, fp16: 125, bf16: 125 }, dramGBs: 273, l2GBs: 1600 },
    cpu: { name: 'Grace (10 × X925 + 10 × A725)', cores: 20, coreClasses: ['performance', 'efficiency'] },
    tools: { nsys: '2026.3 (synthetic)', ncu: '2026.2 (synthetic)', perf: '6.11 (synthetic)', torch: '2.10 (synthetic)' },
    counters: { unsupported: ['lts__t_sectors_srcunit_ltcfabric*'] },
    synthetic: true,
  },
  'playback@rtx-dev': {
    host: 'playback@rtx-dev',
    arch: 'x86_64',
    gpu: { name: 'RTX PRO 6000 Blackwell (synthetic)', count: 1, precisions: ['fp32', 'fp16', 'bf16'], peakTflops: { fp32: 120, fp16: 480, bf16: 480 }, dramGBs: 1792, l2GBs: 6000 },
    cpu: { name: 'x86-64, 32 cores', cores: 32, coreClasses: ['performance'] },
    tools: { nsys: '2026.3 (synthetic)', ncu: '2026.2 (synthetic)', perf: '6.8 (synthetic)', torch: '2.10 (synthetic)' },
    counters: { unsupported: [] },
    synthetic: true,
  },
};

/**
 * A real host's capability report: what a build may ask `ctx.capabilities` about a host the Kiln server runs jobs on.
 * The page derives one per host from GET /api/hosts (`hostReport`); the synthetic hosts above are used only for names
 * no real report covers, and stay labelled synthetic.
 */
export interface HostReport {
  host: string;
  arch: 'arm64' | 'x86_64';
  cpu: { name: string; cores: number; coreClasses: string[] };
  memoryBytes: number | null;
  gpu: { name: string; count: number; precisions: string[] };
  /** devices a workload may run on in the host's lab environment */
  devices: string[];
  tools: Record<string, string>;
  threads: number;
  counters: { unsupported: string[]; reason?: string };
  synthetic: false;
}

/** The parts of a GET /api/hosts host view a report is made from (apps/server/src/exec/hosts.ts HostView). */
export interface HostViewLike {
  id: string;
  machine: { arch: string; cpu?: { model: string | null; cores: number | null }; memBytes: number | null } | null;
  gpus: { name: string; cc: string }[];
  gpuCounters: string | null;
  environmentFacts?: Record<string, { ok: boolean; found: Record<string, string | null> }>;
  offers: { kinds: Record<string, { environment?: string; blocked?: string }> } | null;
}

/** The lab environment of a host: the one perf-lab-sampler/1 is offered in. */
const LAB_KIND = 'perf-lab-sampler/1';

/**
 * A host view as a capability report, or null for a host not probed yet. `workloads` is the server's revision of the
 * lab workload sources (GET /api/hosts `workloads.perf_lab_local`), which programs put into their arms' revisions.
 */
export function hostReport(view: HostViewLike, workloads: string | null): HostReport | null {
  const m = view.machine;
  if (!m || !view.offers) return null;
  const envName = view.offers.kinds[LAB_KIND]?.environment;
  const found = (envName && view.environmentFacts?.[envName]?.found) || {};
  const gpu = view.gpus[0];
  const cc = gpu ? Number(gpu.cc) : 0;
  const counters = view.gpuCounters === 'all-users' ? { unsupported: [] } : { unsupported: ['*'], reason: !gpu ? 'no GPU on this host' : view.gpuCounters === 'admin-only' ? 'GPU counters are restricted to administrators (NVreg_RestrictProfilingToAdminUsers=1)' : 'the probe could not tell whether GPU counters are readable' };
  const version = (k: string) => found[k] ?? 'unavailable';
  return {
    host: view.id,
    arch: m.arch === 'arm64' || m.arch === 'aarch64' ? 'arm64' : 'x86_64',
    cpu: { name: m.cpu?.model ?? 'unknown CPU', cores: m.cpu?.cores ?? 0, coreClasses: ['unknown'] },
    memoryBytes: m.memBytes,
    gpu: gpu ? { name: gpu.name, count: view.gpus.length, precisions: cc >= 8 ? ['fp32', 'fp16', 'bf16'] : ['fp32', 'fp16'] } : { name: 'none', count: 0, precisions: [] },
    // the lab environment is a Linux container: no MPS, and this workload's timing has no CUDA synchronisation
    devices: ['cpu'],
    tools: {
      python: version('python'), torch: version('torch'), numpy: version('numpy'),
      'torch.profiler': found.torch ? 'yes' : 'unavailable', 'torch.compile': found.torch ? 'inductor (cpu)' : 'unavailable',
      ncu: version('ncu'), nsys: version('nsys'),
      ...(workloads ? { workloads } : {}),
      ...(envName ? { environment: envName } : { environment: `none: ${view.offers.kinds[LAB_KIND]?.blocked ?? 'no lab environment'}` }),
    },
    threads: m.cpu?.cores ?? 0,
    counters,
    synthetic: false,
  };
}

export const KNOWN_HOSTS = Object.keys(HOSTS);

/** The hosts a program may name: the real ones reported, then the synthetic ones. */
export const knownHosts = (reports: Readonly<Record<string, HostReport>> = {}) => [...Object.keys(reports), ...KNOWN_HOSTS.filter((h) => !(h in reports))];

const NO_SERVER = 'the page is not served by the Kiln server';

/**
 * Capability reports for a build. Perf Lab kept one local report in a module variable set by the app; here the real
 * reports are an argument, so two environments (a test, a board, the check script) never share them. A real report
 * wins over a synthetic host of the same name; a name in neither throws, with `error` as the reason when there are
 * no real reports at all.
 */
export function capabilitiesFor(reports: Readonly<Record<string, HostReport>> = {}, error = NO_SERVER): (host: string) => Capabilities {
  return (host) => {
    const r = reports[host];
    if (r) {
      return {
        host: r.host,
        arch: r.arch,
        gpu: {
          name: r.gpu.name,
          count: r.gpu.count,
          supports: (p: string) => r.gpu.precisions.includes(p),
          // no measured or datasheet peak is recorded for this host; a roofline must not invent one
          peak: () => Number.NaN,
        },
        cpu: { name: r.cpu.name, cores: r.cpu.cores, coreClasses: r.cpu.coreClasses },
        tools: r.tools,
        counters: { unsupported: r.counters.unsupported },
        devices: r.devices,
        synthetic: false,
      };
    }
    const h = HOSTS[host];
    if (!h) throw new Error(`no capability report for host "${host}"${Object.keys(reports).length ? '' : `: ${error}`} (known: ${knownHosts(reports).join(', ')})`);
    return {
      ...h,
      gpu: {
        name: h.gpu.name,
        count: h.gpu.count,
        supports: (p: string) => h.gpu.precisions.includes(p),
        peak: (p: string, level: string) =>
          level === 'compute' ? (h.gpu.peakTflops[p] ?? 0) * 1e12 : level === 'l2' ? h.gpu.l2GBs * 1e9 : h.gpu.dramGBs * 1e9,
      },
    };
  };
}

/** The synthetic hosts only (no real reports). */
export const capabilities = capabilitiesFor();

/** Adapter contracts: which ablation treatments have an independent switch in the pinned implementation. */
const ADAPTERS: Record<string, AdapterContract> = {
  dino: {
    name: 'dino',
    // Replay and fusion discovery are coupled in ReplayModel._capture, so replay alone and fusion alone
    // have no independent switch (intern guide §6.4).
    supports: (t) => ['reference', 'norm+transfers', 'replay+fusion', 'integrated'].includes(t),
    switchesFor: (t) =>
      ({
        reference: { exact_normalization: false, bulk_transfers: false, replay: false },
        'norm+transfers': { exact_normalization: true, bulk_transfers: true, replay: false },
        'replay+fusion': { exact_normalization: false, bulk_transfers: false, replay: true },
        integrated: { exact_normalization: true, bulk_transfers: true, replay: true },
      })[t] ?? {},
    perRequestMs: 110,
  },
  embedding: {
    name: 'embedding',
    supports: (t) => ['reference', 'graph', 'graph+norm', 'integrated'].includes(t),
    switchesFor: (t) => ({ graph: t !== 'reference', norm: t.includes('norm') || t === 'integrated' }),
    graphCache: { capacity: 2 },
    perRequestMs: 90,
  },
  sampler: {
    name: 'sampler',
    // arms choose the implementation with switches({ impl }); each impl is a separate code path
    supports: (t) => ['unfused', 'gather', 'compiled'].includes(t),
    switchesFor: (t) => ({ impl: t }),
    // per-request wall time is a few ms; process start, imports and compilation dominate a repetition
    perRequestMs: 400,
  },
  unknown: { name: 'unknown', supports: () => false, switchesFor: () => ({}), perRequestMs: 100 },
};

export function adapter(name: string): AdapterContract {
  return ADAPTERS[name] ?? ADAPTERS.unknown!;
}
