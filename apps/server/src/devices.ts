// Devices (guide §23, §30.3): every device seen in a record, plus every configured CUDA executor with the device
// its last probe or job reported. A CUDA device's identity is built from the runner's device report exactly as the
// page's CudaDevice.adopt builds it (K/src/std/devices.js), so a job's records and an imported results file of the
// same report carry the same device id when the host string agrees.
import { deviceId, type Fingerprint } from '@kiln/evidence';
import { all, now, type Db } from './db.ts';
import type { EventBus } from './events.ts';
import type { DeviceReport, Executor } from './executors/types.ts';
import { upsertDevice } from './records.ts';

export interface CudaIdentity {
  id: string;
  class: 'cuda';
  name: string;
  fingerprint: Fingerprint;
}

/** name "CUDA <report name>", fingerprint = the report's flat fields + host, id deviceId('cuda', report name, fp). */
export function cudaIdentity(report: DeviceReport, host: string): CudaIdentity {
  const flat = Object.fromEntries(Object.entries(report).filter(([, v]) => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) as Fingerprint;
  const fingerprint: Fingerprint = { ...flat, host: String(host) };
  const name = typeof report.name === 'string' ? report.name : '';
  return { id: deviceId('cuda', name || 'cuda', fingerprint), class: 'cuda', name: `CUDA ${name}`.trim(), fingerprint };
}

export interface DeviceView {
  /** null for an executor whose device is not known yet (never probed, or the probe failed) */
  id: string | null;
  class: string;
  name: string;
  fingerprint: Fingerprint | null;
  /** The executor that reaches this device, if any */
  executor: string | null;
  /** An executor reached it at its last probe or job */
  available: boolean;
  error?: string;
  records: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface ProbeState {
  at: string;
  identity: CudaIdentity | null;
  error: string | null;
}

export class Devices {
  private readonly probes = new Map<string, ProbeState>();
  private readonly db: Db;
  private readonly bus: EventBus;
  readonly executors: ReadonlyMap<string, Executor>;

  constructor(db: Db, bus: EventBus, executors: ReadonlyMap<string, Executor>) {
    this.db = db;
    this.bus = bus;
    this.executors = executors;
  }

  /** Ask the executor's runner for its device report. Never throws for a failed probe: the view says why. */
  async probe(executorId: string, signal: AbortSignal = AbortSignal.timeout(120_000)): Promise<DeviceView | null> {
    const ex = this.executors.get(executorId);
    if (!ex) return null;
    try {
      this.reached(executorId, cudaIdentity(await ex.probe(signal), ex.host));
    } catch (e) {
      this.probes.set(executorId, { at: now(), identity: this.probes.get(executorId)?.identity ?? null, error: (e as Error).message });
    }
    const view = this.list().find((d) => d.executor === executorId) ?? null;
    this.bus.emit('device.updated', view);
    return view;
  }

  /** A probe or a job's repetition reached this device through this executor. */
  reached(executorId: string, identity: CudaIdentity): void {
    const at = now();
    upsertDevice(this.db, identity, at);
    this.probes.set(executorId, { at, identity, error: null });
  }

  list(): DeviceView[] {
    const rows = all<{ id: string; class: string; name: string; fingerprint_json: string; first_seen: string; last_seen: string; n: number }>(
      this.db,
      `select d.*, (select count(*) from records r where r.device_id = d.id) as n from devices d order by d.class, d.name, d.id`,
    );
    const byDevice = new Map<string, [string, ProbeState]>();
    for (const [ex, p] of this.probes) if (p.identity) byDevice.set(p.identity.id, [ex, p]);
    const out: DeviceView[] = rows.map((r) => {
      const hit = byDevice.get(r.id);
      return {
        id: r.id, class: r.class, name: r.name, fingerprint: JSON.parse(r.fingerprint_json) as Fingerprint,
        executor: hit?.[0] ?? null, available: !!hit && !hit[1].error, ...(hit?.[1].error ? { error: hit[1].error } : {}),
        records: r.n, firstSeen: r.first_seen, lastSeen: r.last_seen,
      };
    });
    // executors whose device is not known: not probed yet, or the probe failed before any device report
    for (const ex of this.executors.values()) {
      if (out.some((d) => d.executor === ex.id)) continue;
      const p = this.probes.get(ex.id);
      const error = p?.error ?? (p ? 'its device was forgotten: probe again' : 'not probed yet');
      out.push({ id: null, class: 'cuda', name: ex.id, fingerprint: null, executor: ex.id, available: false, error, records: 0, firstSeen: null, lastSeen: null });
    }
    return out;
  }
}
