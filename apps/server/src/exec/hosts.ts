// Hosts (guide §13): the profiles a person writes in kiln-hosts/1, and what the server knows about each host's driver.
// A probe asks the driver for facts about every environment of the profile and derives the capability document from
// them (§15-§18). Probes are cached for `probeTtlMs`; a driver whose file differs from the server's copy is replaced
// through PUT /v1/self before it is probed, when it is idle.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capabilities, COLLECTORS, KINDS, parseHosts, probeRequest, type Capabilities, type EnvironmentFacts, type Facts, type GpuFact, type HostProfile, type Offers, type Requirement } from '@kiln/exec';
import type { EventBus } from '../events.ts';
import { DriverClient, DriverError, type DriverInfo } from './driver-client.ts';

/** Reads kiln-hosts/1. A data directory that still holds the retired executors.json refuses to start. */
export function loadHosts(c: { hostsFile: string; dataDir: string }): { hosts: HostProfile[]; errors: string[] } {
  const retired = join(c.dataDir, 'executors.json');
  if (existsSync(retired)) throw new Error(`${retired} is retired: describe hosts in ${c.hostsFile} (kiln-hosts/1, KILN-003 guide §13.1) and delete it`);
  if (!existsSync(c.hostsFile)) return { hosts: [], errors: [] };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(c.hostsFile, 'utf8'));
  } catch (e) {
    return { hosts: [], errors: [`${c.hostsFile}: ${(e as Error).message}`] };
  }
  return parseHosts(json);
}

export interface HostView {
  id: string;
  url: string;
  /** null until the server has contacted the driver */
  reachable: boolean | null;
  error: string | null;
  driver: { sha256: string; hostname: string; running: string | null; queued: string[]; current: boolean } | null;
  probedAt: string | null;
  environments: string[];
  /** The machine the last probe saw: hostname, kernel, arch, memory, free disk, docker version */
  machine: Facts['host'] | null;
  gpus: GpuFact[];
  gpuCounters: string | null;
  /** Per environment: its image, whether the probe container ran, and the versions of what it found */
  environmentFacts: Record<string, EnvironmentSummary>;
  offers: Offers | null;
}

export interface EnvironmentSummary {
  imageRef: string;
  image: string | null;
  ok: boolean;
  error: string | null;
  python: string | null;
  gpuVisible: boolean | null;
  /** Commands, modules and tools by name: their version, or null when missing */
  found: Record<string, string | null>;
}

const summary = (e: EnvironmentFacts): EnvironmentSummary => ({
  imageRef: e.imageRef, image: e.image, ok: e.ok, error: e.error ?? null, python: e.python ?? null, gpuVisible: e.gpuVisible ?? null,
  found: Object.fromEntries([e.commands, e.modules, e.tools].flatMap((m) => Object.entries(m ?? {})).map(([k, r]) => [k, r.ok ? (r.version ?? 'present') : null])),
});

interface State {
  info: DriverInfo | null;
  reachable: boolean | null;
  error: string | null;
  caps: Capabilities | null;
  at: number;
}

const REQUIREMENTS: Requirement[] = [...KINDS.flatMap((k) => k.requires), ...COLLECTORS.flatMap((c) => c.requires)];

export class Hosts {
  private readonly profiles: Map<string, HostProfile>;
  private readonly state = new Map<string, State>();
  private readonly probing = new Map<string, Promise<Capabilities>>();
  private readonly opts: { driverFile: string; probeTtlMs: number; bus: EventBus };

  constructor(profiles: readonly HostProfile[], opts: { driverFile: string; probeTtlMs: number; bus: EventBus }) {
    this.profiles = new Map(profiles.map((p) => [p.id, p]));
    this.opts = opts;
  }

  get size(): number {
    return this.profiles.size;
  }
  ids(): string[] {
    return [...this.profiles.keys()];
  }
  profile(id: string): HostProfile | undefined {
    return this.profiles.get(id);
  }
  client(id: string): DriverClient {
    return new DriverClient(this.profiles.get(id)!.url);
  }

  /** The driver file the server ships, and its hash: what every driver should run. */
  driver(): { bytes: Uint8Array; sha256: string } {
    const bytes = readFileSync(this.opts.driverFile);
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  /** The last capability document, if any, however old. */
  cached(id: string): Capabilities | null {
    return this.state.get(id)?.caps ?? null;
  }

  /** The capability document, probing when there is none or it is older than the TTL (or `force`). */
  async capabilities(id: string, { force = false } = {}): Promise<Capabilities> {
    const s = this.state.get(id);
    if (!force && s?.caps && Date.now() - s.at < this.opts.probeTtlMs) return s.caps;
    const running = this.probing.get(id);
    if (running) return running;
    const p = this.probe(id).finally(() => this.probing.delete(id));
    this.probing.set(id, p);
    return p;
  }

  private async probe(id: string): Promise<Capabilities> {
    const profile = this.profiles.get(id);
    if (!profile) throw new DriverError(404, `no host ${id}`);
    const client = new DriverClient(profile.url);
    const prev = this.state.get(id);
    try {
      let info = await client.info();
      const mine = this.driver();
      if (info.sha256 !== mine.sha256 && !info.running && !info.queued.length) {
        await client.putSelf(mine.bytes);
        info = await this.waitForDriver(client, mine.sha256);
        this.opts.bus.emit('host.updated', { id, driverUpdated: info.sha256 });
      }
      const facts = await client.probe(probeRequest(profile, REQUIREMENTS));
      const caps = capabilities(profile, facts, KINDS);
      this.state.set(id, { info, reachable: true, error: null, caps, at: Date.now() });
      this.opts.bus.emit('host.updated', this.view(id));
      return caps;
    } catch (e) {
      this.state.set(id, { info: prev?.info ?? null, reachable: false, error: (e as Error).message, caps: prev?.caps ?? null, at: prev?.at ?? 0 });
      this.opts.bus.emit('host.updated', this.view(id));
      throw e;
    }
  }

  private async waitForDriver(client: DriverClient, sha: string): Promise<DriverInfo> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const info = await client.info();
        if (info.sha256 === sha) return info;
      } catch {
        // restarting: the socket is closed for a moment
      }
      if (Date.now() > deadline) throw new DriverError(0, `the driver at ${client.url} did not come back with the new file within 20 s`);
    }
  }

  /** Refresh only the driver's info (queue state); never throws. */
  async ping(id: string): Promise<HostView | null> {
    const profile = this.profiles.get(id);
    if (!profile) return null;
    const s = this.state.get(id) ?? { info: null, reachable: null, error: null, caps: null, at: 0 };
    try {
      this.state.set(id, { ...s, info: await new DriverClient(profile.url).info(), reachable: true, error: s.caps ? null : s.error });
    } catch (e) {
      this.state.set(id, { ...s, reachable: false, error: (e as Error).message });
    }
    return this.view(id);
  }

  view(id: string): HostView | null {
    const p = this.profiles.get(id);
    if (!p) return null;
    const s = this.state.get(id);
    const caps = s?.caps ?? null;
    const sha = existsSync(this.opts.driverFile) ? this.driver().sha256 : null;
    return {
      id, url: p.url, reachable: s?.reachable ?? null, error: s?.error ?? null,
      driver: s?.info ? { sha256: s.info.sha256, hostname: s.info.hostname, running: s.info.running, queued: s.info.queued, current: s.info.sha256 === sha } : null,
      probedAt: caps?.probedAt ?? null,
      environments: Object.keys(p.environments),
      machine: caps?.facts.host ?? null,
      gpus: caps?.facts.gpus ?? [],
      gpuCounters: caps?.facts.gpuCounters ?? null,
      environmentFacts: Object.fromEntries(Object.entries(caps?.facts.environments ?? {}).map(([n, e]) => [n, summary(e)])),
      offers: caps?.offers ?? null,
    };
  }

  list(): HostView[] {
    return this.ids().map((id) => this.view(id)!);
  }
}
