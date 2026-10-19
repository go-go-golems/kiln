// The data a lab build reads from the outside world, injected. Perf Lab read it from Redux and from module caches
// that its thunks filled by fetching the lab server; here it is one synchronous interface, so the language runs
// headless (tests, the check script, an agent) and in the browser alike. Builds are synchronous, so whatever
// implements LabData must have loaded what it serves before a build runs: a client of Phase 8c's /api/lab routes
// fetches the catalog, the bundles of measured captures, the archives and the datasets, and fills a MemoryLabData
// with the JSON exactly as the routes return it (see `createMemoryLabData`).
import type { IR } from '../lang/ir.ts';
import { reviveBundles, type BundleJSON, type RunBundle } from './bundles.ts';
import type { LocalReport } from './capabilities.ts';
import { defaultMediaUrl, evidenceBlockedBy, type ArchiveInfo, type DatasetDetail } from './datasets.ts';

/** A stored capture, by hash: GET /api/lab/catalog returns `{ [hash]: CatalogEntry }` for the available ones. */
export interface CatalogEntry {
  /** measured: imported from a real run; the others are synthetic */
  origin: 'synthetic' | 'measured' | 'seed' | 'job';
  /** 'evidence:<sha256>' when the run was imported from an archive rather than executed by a lab job */
  source?: string | null | undefined;
  ref?: string | undefined;
  host?: string | undefined;
  reps?: number | undefined;
  labId?: string | null | undefined;
  importedAt?: string | null | undefined;
  /** Perf Lab's client-side timestamp; unused by builds */
  at?: number | undefined;
}

/** Everything a build reads besides the program: availability, measured runs, archives, datasets, the local host. */
export interface LabData {
  /** the artifact store's available captures by hash: a capture is visible to queries only when listed here */
  catalog(): Readonly<Record<string, CatalogEntry>>;
  /** whether the bundles of a hash have been loaded (an empty result counts: the store has none) */
  bundlesLoaded(hash: string): boolean;
  /** one repetition of a measured capture; undefined when not loaded or not stored */
  bundleRun(hash: string, rep: number): RunBundle | undefined;
  /** whether an evidence archive with this SHA-256 is registered */
  archive(sha256: string): boolean;
  /** registered datasets with their images and annotations */
  datasets(): readonly DatasetDetail[];
  /** why no evidence can be imported at all, if so (a server without the 'evidence-import' feature) */
  evidenceBlocked(): string | undefined;
  /** the probe report of the machine the lab server runs on; null when there is none */
  localReport(): LocalReport | null;
  /** why there is no local report (shown when a program names host 'local') */
  localReportError?(): string | undefined;
  /** URL of a dataset image's bytes */
  mediaUrl?(sha256: string): string;
}

/** A LabData held in memory, filled with the /api/lab routes' JSON. */
export interface MemoryLabData extends LabData {
  /** GET /api/lab/catalog */
  setCatalog(catalog: Record<string, CatalogEntry>): void;
  /** GET /api/lab/bundles?hashes=…: every requested hash, with [] for one the store has no bundles of */
  addBundles(byHash: Record<string, readonly BundleJSON[]>): void;
  /** forget a hash's bundles (after an import replaced them) */
  dropBundles(hash: string): void;
  /** GET /api/lab/evidence */
  setArchives(archives: readonly ArchiveInfo[]): void;
  /** GET /api/lab/datasets/:id for each dataset */
  setDatasets(details: readonly DatasetDetail[]): void;
  /** GET /api/lab/health's `features`; null when unknown */
  setFeatures(features: readonly string[] | null): void;
  /** GET /api/lab/hosts/local/capabilities, or null and why not */
  setLocalReport(report: LocalReport | null, error?: string): void;
}

export interface MemoryLabDataInit {
  catalog?: Record<string, CatalogEntry>;
  bundles?: Record<string, readonly BundleJSON[]>;
  archives?: readonly ArchiveInfo[];
  datasets?: readonly DatasetDetail[];
  features?: readonly string[] | null;
  localReport?: LocalReport | null;
  localReportError?: string;
  mediaUrl?: (sha256: string) => string;
}

export function createMemoryLabData(init: MemoryLabDataInit = {}): MemoryLabData {
  let catalog: Record<string, CatalogEntry> = { ...(init.catalog ?? {}) };
  const bundles = new Map<string, RunBundle[]>();
  let archives = new Map<string, ArchiveInfo>();
  let datasets: readonly DatasetDetail[] = [...(init.datasets ?? [])];
  let features: readonly string[] | null = init.features ?? null;
  let local: LocalReport | null = init.localReport ?? null;
  let localError: string | undefined = init.localReportError;
  const mediaUrl = init.mediaUrl ?? defaultMediaUrl;
  const data: MemoryLabData = {
    catalog: () => catalog,
    bundlesLoaded: (hash) => bundles.has(hash),
    bundleRun: (hash, rep) => bundles.get(hash)?.find((b) => b.run.rep === rep),
    archive: (sha) => archives.has(sha),
    datasets: () => datasets,
    evidenceBlocked: () => evidenceBlockedBy(features),
    localReport: () => local,
    localReportError: () => localError,
    mediaUrl,
    setCatalog: (c) => {
      catalog = { ...c };
    },
    addBundles: (byHash) => {
      for (const [hash, runs] of Object.entries(byHash)) bundles.set(hash, reviveBundles(runs));
    },
    dropBundles: (hash) => {
      bundles.delete(hash);
    },
    setArchives: (list) => {
      archives = new Map(list.map((a) => [a.sha256, a]));
    },
    setDatasets: (list) => {
      datasets = [...list];
    },
    setFeatures: (f) => {
      features = f;
    },
    setLocalReport: (r, error) => {
      local = r;
      if (error !== undefined) localError = error;
    },
  };
  if (init.archives) data.setArchives(init.archives);
  if (init.bundles) data.addBundles(init.bundles);
  return data;
}

/**
 * The measured captures of a build whose bundles are not loaded yet: fetch these (GET /api/lab/bundles?hashes=…,
 * at most 64 per request), add them, and build again. Perf Lab's thunks did the same after every build.
 */
export const bundlesNeeded = (ir: IR, data: LabData): string[] => {
  const catalog = data.catalog();
  return [...new Set(ir.plan.captures.map((c) => c.hash))].filter((h) => catalog[h]?.origin === 'measured' && !data.bundlesLoaded(h));
};
