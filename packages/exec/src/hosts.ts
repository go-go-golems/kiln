// Host profiles (guide §13.1): kiln-hosts/1, validated entry by entry. An invalid host is reported with its message
// and left out; the other hosts are unaffected.
import type { DockerOptions, EnvironmentProfile, HostProfile, Threads, ToolMount } from './model.ts';

export const HOSTS_FORMAT = 'kiln-hosts/1';
export const HOST_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const ENVIRONMENT_NAME = /^[a-z0-9][a-z0-9._-]{0,62}$/;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const optStr = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);

function docker(x: unknown, at: string): DockerOptions {
  if (x !== undefined && !isObj(x)) throw new TypeError(`${at}.docker must be an object`);
  const d = (x ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(d)) if (!['gpus', 'network', 'memory', 'shmSize'].includes(k)) throw new TypeError(`${at}.docker.${k}: unknown option`);
  return { gpus: optStr(d.gpus) ?? 'all', network: optStr(d.network) ?? 'none', memory: optStr(d.memory), shmSize: optStr(d.shmSize) };
}

function threads(x: unknown, at: string): Threads | null {
  if (x === undefined || x === null) return null;
  if (!isObj(x)) throw new TypeError(`${at}.threads must be an object`);
  const out: Threads = {};
  for (const [k, v] of Object.entries(x)) {
    if (!['omp', 'mkl', 'openblas', 'inductorCompile'].includes(k)) throw new TypeError(`${at}.threads.${k}: unknown setting`);
    if (!isInt(v, 1, 1024)) throw new TypeError(`${at}.threads.${k} must be an integer in 1..1024`);
    out[k as keyof Threads] = v;
  }
  return out;
}

function environment(x: unknown, at: string): EnvironmentProfile {
  if (!isObj(x)) throw new TypeError(`${at} must be an object`);
  if (typeof x.image !== 'string' || !x.image) throw new TypeError(`${at}.image must name an image`);
  if (x.python !== undefined && (typeof x.python !== 'string' || !x.python)) throw new TypeError(`${at}.python must be a path or command`);
  return { image: x.image, python: (x.python as string | undefined) ?? 'python3', docker: docker(x.docker, at), threads: threads(x.threads, at) };
}

function toolMount(name: string, x: unknown, at: string): ToolMount {
  const dir = typeof x === 'string' ? x : isObj(x) ? x.mount : undefined;
  if (typeof dir !== 'string' || !dir.startsWith('/')) throw new TypeError(`${at} must be an absolute directory or {mount, bin}`);
  const mount = dir.replace(/\/+$/, '');
  const bin = isObj(x) && typeof x.bin === 'string' ? x.bin : `${mount}/bin/${name}`;
  if (!bin.startsWith(`${mount}/`)) throw new TypeError(`${at}.bin must lie below ${mount}`);
  return { mount, bin };
}

/** One host profile; throws a TypeError naming the problem. */
export function parseHost(x: unknown, at = 'host'): HostProfile {
  if (!isObj(x)) throw new TypeError(`${at} must be an object`);
  const id = x.id;
  if (typeof id !== 'string' || !HOST_ID.test(id)) throw new TypeError(`${at}.id must be lowercase letters, digits and hyphens (got ${String(id)})`);
  at = `host ${id}`;
  let url: URL;
  try {
    url = new URL(String(x.url));
  } catch {
    throw new TypeError(`${at}.url must be the driver's URL, e.g. http://127.0.0.1:5281`);
  }
  if (url.protocol !== 'http:') throw new TypeError(`${at}.url must be http:// (the driver speaks plain HTTP)`);
  if (!isObj(x.environments) || !Object.keys(x.environments).length) throw new TypeError(`${at}.environments must name at least one environment`);
  const environments: Record<string, EnvironmentProfile> = {};
  for (const [name, e] of Object.entries(x.environments)) {
    if (!ENVIRONMENT_NAME.test(name) || name === 'host') throw new TypeError(`${at}: environment name ${name} must be lowercase letters, digits, '.', '_' or '-' (and not 'host')`);
    environments[name] = environment(e, `${at}.environments.${name}`);
  }
  const toolMounts: Record<string, ToolMount> = {};
  if (x.toolMounts !== undefined) {
    if (!isObj(x.toolMounts)) throw new TypeError(`${at}.toolMounts must map tool names to directories`);
    for (const [name, m] of Object.entries(x.toolMounts)) toolMounts[name] = toolMount(name, m, `${at}.toolMounts.${name}`);
  }
  const lock = x.lock === undefined ? {} : x.lock;
  if (!isObj(lock)) throw new TypeError(`${at}.lock must be {waitSeconds}`);
  const waitSeconds = lock.waitSeconds ?? 1800;
  if (!isInt(waitSeconds, 0, 86_400)) throw new TypeError(`${at}.lock.waitSeconds must be an integer in 0..86400`);
  const idle = x.idleWindowSeconds ?? 0;
  if (!isInt(idle, 0, 600)) throw new TypeError(`${at}.idleWindowSeconds must be an integer in 0..600`);
  const gpu = x.gpu ?? 0;
  if (!isInt(gpu, 0, 63)) throw new TypeError(`${at}.gpu must be a GPU index`);
  for (const k of Object.keys(x)) if (!['id', 'url', 'environments', 'toolMounts', 'lock', 'idleWindowSeconds', 'gpu'].includes(k)) throw new TypeError(`${at}.${k}: unknown field`);
  return { id, url: url.toString().replace(/\/$/, ''), environments, toolMounts, lock: { waitSeconds }, idleWindowSeconds: idle, gpu };
}

/** A kiln-hosts/1 document: the valid hosts, and one message per refused host or document problem. */
export function parseHosts(json: unknown): { hosts: HostProfile[]; errors: string[] } {
  if (!isObj(json) || json.format !== HOSTS_FORMAT || !Array.isArray(json.hosts)) return { hosts: [], errors: [`expected { "format": "${HOSTS_FORMAT}", "hosts": [...] }`] };
  const hosts: HostProfile[] = [], errors: string[] = [], ids = new Set<string>();
  json.hosts.forEach((h, i) => {
    try {
      const p = parseHost(h, `hosts[${i}]`);
      if (ids.has(p.id)) throw new TypeError(`host ${p.id} is defined twice`);
      ids.add(p.id);
      hosts.push(p);
    } catch (e) {
      errors.push((e as Error).message);
    }
  });
  return { hosts, errors };
}
