// Evidence archives and datasets as a build sees them. Ported from Perf Lab (PL/src/data/datasets.ts) without its
// module-level caches and fetches: the details arrive through LabData (lab-data.ts), and this module only turns a
// dataset's detail into the dataset-scoped entities (image, annotation) the query engine reads.
import { cocoBox } from '../lang/detections.ts';
import type { DatasetInfo } from '../lang/env.ts';
import type { RawEnt } from '../lang/rows.ts';
import type { DatasetProvider } from './source.ts';

/** An evidence archive registered on the lab server: GET /api/lab/evidence returns a list of these. */
export interface ArchiveInfo {
  sha256: string;
  name: string;
  bytes: number;
  files: { path: string; bytes: number }[];
  datasets: string[];
  addedAt?: string;
}

export interface DatasetImage {
  imageId: number;
  fileName: string;
  sha256: string;
  width: number;
  height: number;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string;
  pageUrl: string | null;
  strata: { category: string; size: string }[];
  negative: boolean;
  present: boolean;
}

export interface DatasetAnnotation {
  id: number;
  imageId: number;
  label: string;
  bboxPx: [number, number, number, number];
  area: number;
  iscrowd: boolean;
}

/** A registered dataset with its images and annotations: GET /api/lab/datasets/:id. */
export interface DatasetDetail extends DatasetInfo {
  format: 'coco';
  privacy: 'public';
  source: string;
  categories: string[];
  annotationCount: number;
  present: number;
  addedAt?: string;
  images: DatasetImage[];
  annotations: DatasetAnnotation[];
}

/** The /health feature a server must list for evidence captures to import rather than run as synthetic. */
export const EVIDENCE_IMPORT_FEATURE = 'evidence-import';

/** Why no evidence can be imported, given the server's /health features (null: features unknown, not blocked). */
export const evidenceBlockedBy = (features: readonly string[] | null): string | undefined =>
  features && !features.includes(EVIDENCE_IMPORT_FEATURE) ? 'the running lab server predates evidence import; restart it' : undefined;

/** Where a dataset image's bytes are served (Phase 8c's media route). */
export const defaultMediaUrl = (sha: string) => `/api/lab/media/${sha}`;

/** The short form a ref uses: dataset:<first 8 hex>. */
export const datasetRefPrefix = (sha: string) => `dataset:${sha.slice(0, 8)}`;

/** COCO's area strata (small < 32², medium < 96²), in original pixels. */
const sizeOf = (area: number) => (area < 32 * 32 ? 'small' : area < 96 * 96 ? 'medium' : 'large');

export interface DatasetEntities {
  image: RawEnt[];
  annotation: RawEnt[];
  byRef: Map<string, RawEnt>;
}

/** A dataset's image and annotation entities (refs `dataset:<8 hex>!image:<id>`, `…!annotation:<id>`). */
export function indexDataset(d: DatasetDetail, mediaUrl: (sha: string) => string = defaultMediaUrl): DatasetEntities {
  const prefix = datasetRefPrefix(d.id);
  const counts = new Map<number, number>();
  for (const a of d.annotations) if (!a.iscrowd) counts.set(a.imageId, (counts.get(a.imageId) ?? 0) + 1);
  const dims = new Map(d.images.map((i) => [i.imageId, i]));
  const image: RawEnt[] = d.images.map((i) => ({
    kind: 'image',
    id: String(i.imageId),
    ref: `${prefix}!image:${i.imageId}`,
    dataset: d.id,
    imageId: i.imageId,
    fileName: i.fileName,
    sha256: i.sha256,
    width: i.width,
    height: i.height,
    license: i.license,
    licenseUrl: i.licenseUrl,
    pageUrl: i.pageUrl,
    strata: i.strata.map((s) => `${s.category}/${s.size}`).join(', ') || 'negative',
    negative: i.negative,
    present: i.present,
    annotations: counts.get(i.imageId) ?? 0,
    mediaUrl: i.present ? mediaUrl(i.sha256) : null,
  }));
  const annotation: RawEnt[] = d.annotations.map((a) => {
    const im = dims.get(a.imageId);
    if (!im) throw new Error(`dataset ${d.id.slice(0, 12)}…: annotation ${a.id} names image ${a.imageId}, which the dataset does not list`);
    return {
      kind: 'annotation',
      id: String(a.id),
      ref: `${prefix}!annotation:${a.id}`,
      dataset: d.id,
      image: a.imageId,
      label: a.label,
      bbox: cocoBox(a.bboxPx, im.width, im.height),
      bboxPx: a.bboxPx,
      area: a.area,
      size: sizeOf(a.area),
      iscrowd: a.iscrowd,
    };
  });
  return { image, annotation, byRef: new Map([...image, ...annotation].map((e) => [e.ref, e])) };
}

const indexCache = new WeakMap<DatasetDetail, Map<(sha: string) => string, DatasetEntities>>();

/** `indexDataset`, computed once per detail object and media-URL function. */
function indexed(d: DatasetDetail, mediaUrl: (sha: string) => string): DatasetEntities {
  let byUrl = indexCache.get(d);
  if (!byUrl) indexCache.set(d, (byUrl = new Map()));
  let ix = byUrl.get(mediaUrl);
  if (!ix) byUrl.set(mediaUrl, (ix = indexDataset(d, mediaUrl)));
  return ix;
}

/** The dataset-scoped entities of these datasets, for createSource. */
export function datasetProvider(details: () => readonly DatasetDetail[], mediaUrl: (sha: string) => string = defaultMediaUrl): DatasetProvider {
  return {
    // a pattern names a dataset by a prefix of its manifest hash (at least 8 hex), with or without `dataset:`
    entities: (kind, pattern) => {
      const p = pattern.replace(/^dataset:/, '');
      if (p.length < 8) return [];
      for (const d of details()) if (d.id.startsWith(p)) return indexed(d, mediaUrl)[kind];
      return [];
    },
    entity: (ref) => {
      const head = (ref.split('!')[0] ?? ref).replace(/^dataset:/, '');
      for (const d of details()) if (d.id.startsWith(head)) return indexed(d, mediaUrl).byRef.get(ref);
      return undefined;
    },
  };
}
