// Build environments: what a build asks the outside world (capabilities, adapters, availability, runs, archives,
// datasets). Ported from Perf Lab (PL/src/data/env.ts): `syntheticEnv` is unchanged apart from taking the real host
// reports as an option; `labEnv` is Perf Lab's `appEnv` with its Redux catalog and module caches replaced by an
// injected LabData.
import { build, type BuildOutput, type Patch } from '../lang/build.ts';
import type { BuildEnv } from '../lang/env.ts';
import { adapter, capabilitiesFor, type HostReport } from './capabilities.ts';
import { datasetProvider } from './datasets.ts';
import type { LabData } from './lab-data.ts';
import { createSource, createSyntheticSource, generatedRun } from './source.ts';

export interface SyntheticEnvOptions {
  /** real host reports by host id; a program naming a host in neither these nor the synthetic ones fails to resolve */
  hosts?: Record<string, HostReport>;
}

/** The synthetic world: capability reports, adapter contracts, and runs generated from each capture's hash. */
export function syntheticEnv(available: ReadonlySet<string> | Record<string, unknown>, opts: SyntheticEnvOptions = {}): BuildEnv {
  const has = available instanceof Set ? (h: string) => available.has(h) : (h: string) => h in (available as Record<string, unknown>);
  return {
    capabilities: capabilitiesFor(opts.hosts ?? {}),
    adapter,
    isAvailable: has,
    makeSource: createSyntheticSource,
  };
}

/**
 * The workbench's world: the catalog decides availability; measured captures read the runs the server imported
 * (a repetition whose bundle is not loaded is not visible), every other capture is generated from its hash and
 * stays labelled synthetic.
 */
export function labEnv(data: LabData): BuildEnv {
  const measured = (h: string) => data.catalog()[h]?.origin === 'measured';
  // one provider per environment, so a dataset is indexed once and not on every build
  const datasets = datasetProvider(() => data.datasets(), data.mediaUrl ? (sha) => data.mediaUrl!(sha) : undefined);
  return {
    // read when a build asks, so a report that arrives after the environment was made is seen
    capabilities: (host) => capabilitiesFor(data.hostReports(), data.hostReportsError?.())(host),
    adapter,
    isAvailable: (h) => h in data.catalog(),
    archive: (sha) => data.archive(sha),
    dataset: (sha) => data.datasets().find((d) => d.id === sha),
    evidenceBlocked: () => data.evidenceBlocked(),
    makeSource: (instances, isAvailable) =>
      createSource(
        instances,
        isAvailable,
        {
          has: (inst, rep) => !measured(inst.hash) || Boolean(data.bundleRun(inst.hash, rep)),
          get: (inst, rep) => (measured(inst.hash) ? data.bundleRun(inst.hash, rep)! : generatedRun(inst, rep)),
        },
        datasets,
      ),
  };
}

export interface SyntheticBuildOptions extends SyntheticEnvOptions {
  labId?: string;
  /** parameter values by storage key; plan-bound ones that differ from the defaults leave captures to execute */
  params?: Record<string, unknown>;
  signals?: Record<string, unknown>;
  patches?: Patch[];
}

/**
 * Build a program against synthetic data, as Perf Lab does the first time it opens a lab: a seed build with default
 * parameters marks every capture of the plan available, and the real build reads their generated runs.
 */
export function buildSynthetic(source: string, opts: SyntheticBuildOptions = {}): BuildOutput {
  const labId = opts.labId ?? 'lab';
  const hosts = { hosts: opts.hosts ?? {} };
  const seed = build({ source, labId, params: {}, env: syntheticEnv(new Set(), hosts), seedMode: true });
  const available = new Set(seed.ir.plan.captures.map((c) => c.hash));
  return build({
    source,
    labId,
    params: opts.params ?? {},
    env: syntheticEnv(available, hosts),
    ...(opts.signals ? { signals: opts.signals } : {}),
    ...(opts.patches ? { patches: opts.patches } : {}),
  });
}
