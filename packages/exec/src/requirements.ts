// Requirements (guide §16): what a kind or a collector needs from an environment, checked against probed facts.
// Each failure is one fixed sentence that names the remedy, so the page and the documentation agree.
import type { EnvironmentProfile, Facts, HostProfile, ProbeEnvironmentRequest, ProbeRequest, Requirement, Verdict } from './model.ts';

export interface CheckContext {
  host: string;
  facts: Facts;
  /** The environment's name in the host profile */
  env: string;
}

const no = (reason: string): Verdict => ({ ok: false, reason });
const OK: Verdict = { ok: true };

/** An environment's own failure (image missing, probe container failed), before any requirement is checked. */
export function environmentVerdict(c: CheckContext): Verdict {
  const e = c.facts.environments[c.env];
  if (!e) return no(`${c.host} has no environment ${c.env}`);
  if (!e.image) return no(`image ${e.imageRef} is not on ${c.host}`);
  if (!e.ok) return no(`the probe could not start ${c.env} on ${c.host}: ${e.error ?? 'unknown error'}`);
  return OK;
}

export function check(req: Requirement, c: CheckContext): Verdict {
  const env = c.facts.environments[c.env];
  const base = environmentVerdict(c);
  if (!base.ok || !env) return base;
  if ('environment' in req) return req.environment === c.env ? OK : no(`${c.host} has no environment ${req.environment}`);
  if ('gpu' in req) {
    if (env.gpuVisible) return OK;
    // a host whose probe found no GPU is the reason, not the environment that inherits it
    if (!c.facts.gpus.length) return no(`${c.host} has no NVIDIA GPU (${c.facts.gpuError ?? 'nvidia-smi listed none'})`);
    return no(`no CUDA GPU is visible inside ${c.env} (nvidia-smi -L failed: ${env.gpuError ?? 'unknown'})`);
  }
  if ('command' in req) return env.commands?.[req.command]?.ok ? OK : no(`${c.env} has no ${req.command}`);
  if ('module' in req) return env.modules?.[req.module]?.ok ? OK : no(`${c.env} cannot import ${req.module}`);
  if ('tool' in req) return env.tools?.[req.tool]?.ok ? OK : no(`${c.env} has no ${req.tool}: build the image with it or add a tool mount`);
  if ('gpuCounters' in req) {
    return c.facts.gpuCounters === 'admin-only' ? no(`GPU counters are restricted to administrators on ${c.host} (RmProfilingAdminOnly=1)`) : OK;
  }
  return no(`unknown requirement ${JSON.stringify(req)}`);
}

/** The first failing requirement, or ok. */
export function checkAll(reqs: readonly Requirement[], c: CheckContext): Verdict {
  const base = environmentVerdict(c);
  if (!base.ok) return base;
  for (const r of reqs) {
    const v = check(r, c);
    if (!v.ok) return v;
  }
  return OK;
}

/** The argument vector that shows a command exists; python is the environment's own interpreter. */
const commandProbe = (name: string, env: EnvironmentProfile): string[] => (name === 'python' ? [env.python, '--version'] : [name, '--version']);

/**
 * kiln-probe-request/1 for a host: every command, module and tool any registered requirement names, in every
 * environment of the profile. The driver does not know why it checks them.
 */
export function probeRequest(host: HostProfile, requirements: readonly Requirement[]): ProbeRequest {
  const commands = new Set<string>(['python']), modules = new Set<string>(), tools = new Set<string>();
  for (const r of requirements) {
    if ('command' in r) commands.add(r.command);
    if ('module' in r) modules.add(r.module);
    if ('tool' in r) tools.add(r.tool);
  }
  const environments: Record<string, ProbeEnvironmentRequest> = {};
  for (const [name, env] of Object.entries(host.environments)) {
    const t: ProbeEnvironmentRequest['tools'] = {};
    for (const tool of [...tools].sort()) {
      const m = host.toolMounts[tool];
      t[tool] = [{ argv: [tool, '--version'], from: 'image' }, ...(m ? [{ argv: [m.bin, '--version'], from: `mount:${m.mount}` }] : [])];
    }
    environments[name] = {
      image: env.image, python: env.python, docker: env.docker,
      commands: Object.fromEntries([...commands].sort().map((c) => [c, commandProbe(c, env)])),
      modules: [...modules].sort(),
      tools: t,
      mounts: [...new Set(Object.values(host.toolMounts).map((m) => m.mount))].sort(),
    };
  }
  return { format: 'kiln-probe-request/1', environments };
}
