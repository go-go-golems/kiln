// Read Perf Lab's SQLite store (PL/.data/perf-lab.sqlite) into a LabData, read-only. The responses are the ones
// Perf Lab's server builds from the same tables (PL/server/app.ts /catalog, store.ts bundlesFor, evidence.ts
// listArchives, datasets.ts getDataset), so a build sees what the Perf Lab app saw. Node-only (node:sqlite, node:zlib).
//
// The store is never opened in place. Perf Lab keeps it in WAL mode, and even a `readOnly: true` connection rewrites
// the `-shm` index next to it, so a reader would write into lab-workbench/.data. Instead the database file and its
// `-wal` (not the `-shm`) are copied into a fresh temporary directory, the copy is opened read-only, and the directory
// is removed afterwards. Nothing next to `dbPath` is opened by SQLite.
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import type { BundleJSON } from '../data/bundles.ts';
import type { ArchiveInfo, DatasetAnnotation, DatasetDetail, DatasetImage } from '../data/datasets.ts';
import { createMemoryLabData, type CatalogEntry, type MemoryLabData } from '../data/lab-data.ts';
import type { LocalReport } from '../data/capabilities.ts';

type Row = Record<string, unknown>;

const unpack = (b: unknown): unknown => JSON.parse(gunzipSync(b as Uint8Array).toString('utf8'));
const str = (x: unknown): string => String(x);
const optStr = (x: unknown): string | null => (x === null || x === undefined ? null : String(x));

/** Perf Lab's /health features: what its server could do, and so what its store holds. */
export const PERF_LAB_FEATURES = ['evidence-import', 'datasets', 'media'];

export interface PerfLabStore {
  /** the store's catalog, bundles, archives and datasets, as a LabData */
  data: MemoryLabData;
  /** the bundles of every measured capture as JSON, exactly as GET /bundles?hashes= returns them */
  bundles: Record<string, BundleJSON[]>;
  /** the measured artifacts' rows, for reporting (hash, experiment/arm/mode, host, reps, source, workload adapter, arm revision) */
  measured: { hash: string; ref: string; host: string; reps: number; source: string | null; adapter: string | null; armRevision: string | null }[];
  counts: { artifacts: number; available: number; measured: number; bundles: number; archives: number; datasets: number };
}

export interface ReadPerfLabOptions {
  /** the probe report to serve as host `local` (Perf Lab does not persist it; its server probes on start) */
  localReport?: LocalReport | null;
  mediaUrl?: (sha256: string) => string;
}

/** Read everything a build may need from Perf Lab's store at `dbPath`, from a temporary copy, opened read-only. */
export function readPerfLabStore(dbPath: string, opts: ReadPerfLabOptions = {}): PerfLabStore {
  if (!existsSync(dbPath)) throw new Error(`no SQLite store at ${dbPath}`);
  const dir = mkdtempSync(join(tmpdir(), 'kiln-lab-pl-'));
  try {
    const copy = join(dir, basename(dbPath));
    copyFileSync(dbPath, copy);
    if (existsSync(`${dbPath}-wal`)) copyFileSync(`${dbPath}-wal`, `${copy}-wal`);
    return readCopy(copy, opts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readCopy(dbPath: string, opts: ReadPerfLabOptions): PerfLabStore {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];

    const artifacts = all('select hash, lab_id, experiment, arm, mode, host, reps, origin, status, imported_at, source, spec_json from artifacts');
    const catalog: Record<string, CatalogEntry> = {};
    const measured: PerfLabStore['measured'] = [];
    for (const a of artifacts) {
      if (a.status !== 'available') continue;
      const hash = str(a.hash);
      const ref = `${str(a.experiment)}/${str(a.arm)}/${str(a.mode)}`;
      catalog[hash] = {
        origin: a.origin as CatalogEntry['origin'],
        source: optStr(a.source),
        ref,
        host: str(a.host),
        reps: Number(a.reps),
        labId: optStr(a.lab_id),
        importedAt: optStr(a.imported_at),
      };
      if (a.origin === 'measured') {
        let armRevision: string | null = null;
        let adapter: string | null = null;
        try {
          const spec = JSON.parse(str(a.spec_json)) as { comparison?: { arm_revision?: unknown }; workload?: { adapter?: unknown } };
          armRevision = typeof spec.comparison?.arm_revision === 'string' ? spec.comparison.arm_revision : null;
          adapter = typeof spec.workload?.adapter === 'string' ? spec.workload.adapter : null;
        } catch {
          // a spec that does not parse leaves both unknown
        }
        measured.push({ hash, ref, host: str(a.host), reps: Number(a.reps), source: optStr(a.source), adapter, armRevision });
      }
    }

    // bundles of every measured capture, as GET /bundles returns them: one per stored repetition, by rep
    const bundles: Record<string, BundleJSON[]> = {};
    let nBundles = 0;
    const bundleRows = db.prepare(
      'select r.run_json, b.entities, b.links from runs r join run_bundles b on b.hash = r.hash and b.rep = r.rep where r.hash = ? order by r.rep',
    );
    for (const m of measured) {
      const rows = bundleRows.all(m.hash) as Row[];
      bundles[m.hash] = rows.map((r) => ({
        run: JSON.parse(str(r.run_json)) as BundleJSON['run'],
        entities: unpack(r.entities) as BundleJSON['entities'],
        links: unpack(r.links) as BundleJSON['links'],
      }));
      nBundles += rows.length;
    }

    const archives: ArchiveInfo[] = all('select * from evidence_archives order by added_at').map((r) => ({
      sha256: str(r.sha256),
      name: str(r.name),
      bytes: Number(r.bytes),
      files: JSON.parse(str(r.files_json)) as ArchiveInfo['files'],
      addedAt: str(r.added_at),
      datasets: all('select id from datasets where source = ?', `evidence:${str(r.sha256)}`).map((d) => str(d.id)),
    }));

    const datasets: DatasetDetail[] = all('select * from datasets order by added_at').map((r) => {
      const id = str(r.id);
      const images = all(
        `select i.*, (m.sha256 is not null) as present from dataset_images i left join media m on m.sha256 = i.sha256
         where i.dataset_id = ? order by i.image_id`,
        id,
      ).map((i): DatasetImage => {
        const strata = JSON.parse(str(i.strata_json)) as DatasetImage['strata'];
        return {
          imageId: Number(i.image_id),
          fileName: str(i.file_name),
          sha256: str(i.sha256),
          width: Number(i.width),
          height: Number(i.height),
          license: optStr(i.license_name),
          licenseUrl: optStr(i.license_url),
          sourceUrl: str(i.source_url),
          pageUrl: optStr(i.page_url),
          strata,
          negative: strata.length === 0,
          present: Boolean(i.present),
        };
      });
      const annotations = all('select * from dataset_annotations where dataset_id = ? order by image_id, id', id).map(
        (a): DatasetAnnotation => ({
          id: Number(a.id),
          imageId: Number(a.image_id),
          label: str(a.category),
          bboxPx: JSON.parse(str(a.bbox_json)) as DatasetAnnotation['bboxPx'],
          area: Number(a.area),
          iscrowd: Boolean(a.iscrowd),
        }),
      );
      return {
        id,
        name: str(r.name),
        format: 'coco',
        privacy: 'public',
        source: str(r.source),
        categories: JSON.parse(str(r.categories_json)) as string[],
        imageCount: Number(r.image_count),
        annotationCount: Number(r.annotation_count),
        present: images.filter((i) => i.present).length,
        addedAt: str(r.added_at),
        provenance: JSON.parse(str(r.provenance_json)) as DatasetDetail['provenance'],
        images,
        annotations,
      };
    });

    const data = createMemoryLabData({
      catalog,
      bundles,
      archives,
      datasets,
      features: PERF_LAB_FEATURES,
      localReport: opts.localReport ?? null,
      localReportError: 'no probe report given (Perf Lab does not store it)',
      ...(opts.mediaUrl ? { mediaUrl: opts.mediaUrl } : {}),
    });
    return {
      data,
      bundles,
      measured,
      counts: {
        artifacts: artifacts.length,
        available: Object.keys(catalog).length,
        measured: measured.length,
        bundles: nBundles,
        archives: archives.length,
        datasets: datasets.length,
      },
    };
  } finally {
    db.close();
  }
}
