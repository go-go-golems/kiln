// Offers (guide §18): what a host can serve, derived from its facts with the same checks the planner applies to every
// capture. A pure function of the registries and the facts, so it is tested without a host.
import { collectorById, COLLECTORS, supports } from './collectors/index.ts';
import type { Capabilities, CollectorOffer, Facts, HostProfile, KindOffer, Offers, Verdict } from './model.ts';
import type { Collector, WorkloadKind } from './registry.ts';
import { checkAll } from './requirements.ts';

/** Environments to try for a kind: its preferred names first, then the rest of the profile in order. */
export function candidateEnvironments(kind: WorkloadKind, host: HostProfile): string[] {
  const names = Object.keys(host.environments);
  return [...kind.environments.filter((n) => names.includes(n)), ...names.filter((n) => !kind.environments.includes(n))];
}

export function kindOffer(kind: WorkloadKind, host: HostProfile, facts: Facts): KindOffer {
  const tried: string[] = [];
  for (const env of candidateEnvironments(kind, host)) {
    const v = checkAll(kind.requires, { host: host.id, facts, env });
    if (v.ok) return { environment: env };
    tried.push(v.reason);
  }
  return { blocked: tried[0] ?? `${host.id} has no environment for ${kind.id}` };
}

/** Can this collector observe this kind's captures in the kind's environment? */
export function collectorVerdict(kind: WorkloadKind, c: Collector, offer: KindOffer, host: HostProfile, facts: Facts): Verdict {
  if ('blocked' in offer) return { ok: false, reason: offer.blocked };
  if (!supports(kind, c)) return { ok: false, reason: `${kind.id} does not cooperate with the in-process collector ${c.id}` };
  return checkAll(c.requires, { host: host.id, facts, env: offer.environment });
}

/** A collector set's verdict for a kind: every collector offered, and no two that exclude each other. */
export function collectorsVerdict(kind: WorkloadKind, ids: readonly string[], offer: KindOffer, host: HostProfile, facts: Facts): Verdict {
  for (const id of ids) {
    const c = collectorById.get(id);
    if (!c) return { ok: false, reason: `no collector ${id}` };
    const clash = c.exclusive?.find((x) => ids.includes(x));
    if (clash) return { ok: false, reason: `${id} and ${clash} cannot observe the same process` };
    const v = collectorVerdict(kind, c, offer, host, facts);
    if (!v.ok) return v;
  }
  return { ok: true };
}

export function offers(host: HostProfile, facts: Facts, kinds: readonly WorkloadKind[], collectors: readonly Collector[] = COLLECTORS): Offers {
  const out: Offers = { kinds: {}, collectors: {} };
  for (const k of kinds) out.kinds[k.id] = kindOffer(k, host, facts);
  for (const c of collectors) {
    const served: string[] = [], reasons: string[] = [];
    for (const k of kinds) {
      const v = collectorVerdict(k, c, out.kinds[k.id]!, host, facts);
      if (v.ok) served.push(k.id);
      else if (supports(k, c)) reasons.push(v.reason);
    }
    out.collectors[c.id] = served.length ? { kinds: served } : ({ blocked: reasons[0] ?? `no registered kind cooperates with ${c.id}` } satisfies CollectorOffer);
  }
  return out;
}

export function capabilities(host: HostProfile, facts: Facts, kinds: readonly WorkloadKind[]): Capabilities {
  return { format: 'kiln-capabilities/1', host: host.id, probedAt: facts.probedAt, facts, offers: offers(host, facts, kinds) };
}
