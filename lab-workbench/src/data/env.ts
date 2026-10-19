import type { BuildEnv } from '@/lang/env';
import { bundleRun } from './bundles';
import { adapter, capabilities } from './capabilities';
import { archiveRegistered, datasetDetail, datasetEntities, datasetEntity, evidenceBlocked } from './datasets';
import { createSource, createSyntheticSource, generatedRun, type DatasetProvider } from './source';

const datasetProvider: DatasetProvider = { entities: datasetEntities, entity: datasetEntity };

/** The synthetic world the prototype builds against: capability reports, adapter contracts and runs. */
export function syntheticEnv(available: ReadonlySet<string> | Record<string, unknown>): BuildEnv {
  const has = available instanceof Set ? (h: string) => available.has(h) : (h: string) => h in (available as Record<string, unknown>);
  return {
    capabilities,
    adapter,
    isAvailable: has,
    makeSource: createSyntheticSource,
  };
}

export interface CatalogEntry {
  /** measured: imported from a real run on the server; the others are synthetic */
  origin: 'synthetic' | 'measured' | 'seed' | 'job';
  /** 'evidence:<sha256>' when the run was imported from an archive rather than executed by a lab job */
  source?: string | null;
  at: number;
}

/**
 * The workbench's world: the server's catalog decides availability; measured captures read the runs the
 * server imported, every other capture is generated from its hash and stays labelled synthetic.
 */
export function appEnv(catalog: Record<string, CatalogEntry>): BuildEnv {
  const measured = (h: string) => catalog[h]?.origin === 'measured';
  return {
    capabilities,
    adapter,
    isAvailable: (h) => h in catalog,
    archive: archiveRegistered,
    dataset: datasetDetail,
    evidenceBlocked,
    makeSource: (instances, isAvailable) =>
      createSource(
        instances,
        isAvailable,
        {
          has: (inst, rep) => !measured(inst.hash) || Boolean(bundleRun(inst.hash, rep)),
          get: (inst, rep) => (measured(inst.hash) ? bundleRun(inst.hash, rep)! : generatedRun(inst, rep)),
        },
        datasetProvider,
      ),
  };
}
