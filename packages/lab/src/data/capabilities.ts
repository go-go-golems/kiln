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

/** The probe report the lab server produced for this machine (real, not synthetic): GET /api/lab/hosts/local/capabilities. */
export interface LocalReport {
  host: 'local';
  arch: 'arm64' | 'x86_64';
  cpu: { name: string; cores: number; coreClasses: string[] };
  memoryBytes: number | null;
  gpu: { name: string; count: number; precisions: string[] };
  devices: string[];
  tools: Record<string, string>;
  threads: number;
  counters: { unsupported: string[]; reason?: string };
  synthetic: false;
}

export const KNOWN_HOSTS = Object.keys(HOSTS);

/** The hosts a program may name: the synthetic ones, and `local` when a probe report is known. */
export const knownHosts = (local: LocalReport | null = null) => (local ? ['local', ...KNOWN_HOSTS] : KNOWN_HOSTS);

const NO_SERVER = 'the lab server is not running';

/**
 * Capability reports for a build. Perf Lab kept the local report in a module variable set by the app
 * (`setLocalReport`); here it is an argument, so two environments (a test, a board, the check script) never share it.
 * Without a report, host `local` throws with `localError` as the reason.
 */
export function capabilitiesFor(local: LocalReport | null, localError = NO_SERVER): (host: string) => Capabilities {
  return (host) => {
    if (host === 'local') {
      const r = local;
      if (!r) throw new Error(`no capability report for host "local": ${localError}`);
      return {
        host: 'local',
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
    if (!h) throw new Error(`no capability report for host "${host}" (known: ${KNOWN_HOSTS.join(', ')})`);
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

/** The synthetic hosts only (no local report). */
export const capabilities = capabilitiesFor(null);

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
