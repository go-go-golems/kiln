import { cocoBox } from '@/lang/detections';
import type { DatasetInfo } from '@/lang/env';
import type { RawEnt } from '@/lang/rows';
import { server } from '@/services/server';

/**
 * The lab server's evidence archives and datasets, as the browser knows them. Like the capability report and
 * the bundle cache, this lives outside Redux: builds read it through BuildEnv (archive, dataset) and the data
 * source reads dataset-scoped entities (image, annotation) from it.
 */

export interface ArchiveInfo {
  sha256: string;
  name: string;
  bytes: number;
  files: { path: string; bytes: number }[];
  datasets: string[];
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

export interface DatasetDetail extends DatasetInfo {
  format: 'coco';
  privacy: 'public';
  source: string;
  categories: string[];
  annotationCount: number;
  present: number;
  images: DatasetImage[];
  annotations: { id: number; imageId: number; label: string; bboxPx: [number, number, number, number]; area: number; iscrowd: boolean }[];
}

const archives = new Map<string, ArchiveInfo>();
const datasets = new Map<string, DatasetDetail>();
const entities = new Map<string, { image: RawEnt[]; annotation: RawEnt[]; byRef: Map<string, RawEnt> }>();

let serverFeatures: string[] | null = null;
/** From /health; a server without 'evidence-import' would run evidence captures as synthetic. */
export const setServerFeatures = (f: string[] | null) => {
  serverFeatures = f;
};
export const evidenceBlocked = () =>
  serverFeatures && !serverFeatures.includes('evidence-import') ? 'the running lab server predates evidence import; restart it (pnpm lab-server)' : undefined;

export const archiveRegistered = (sha: string) => archives.has(sha);
export const listArchivesLoaded = () => [...archives.values()];
export const datasetDetail = (sha: string) => datasets.get(sha);
export const listDatasetsLoaded = () => [...datasets.values()];
export const mediaUrl = (sha: string) => `/api/media/${sha}`;

/** The short form a ref uses: dataset:<first 8 hex>. */
export const datasetRefPrefix = (sha: string) => `dataset:${sha.slice(0, 8)}`;

/** COCO's area strata (small < 32², medium < 96²), in original pixels. */
const sizeOf = (area: number) => (area < 32 * 32 ? 'small' : area < 96 * 96 ? 'medium' : 'large');

function indexDataset(d: DatasetDetail) {
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
    const im = dims.get(a.imageId)!;
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
  entities.set(d.id, { image, annotation, byRef: new Map([...image, ...annotation].map((e) => [e.ref, e])) });
}

/** Dataset-scoped raw entities: kind image or annotation of the dataset whose hash starts with `pattern`. */
export function datasetEntities(kind: 'image' | 'annotation', pattern: string): RawEnt[] {
  const p = pattern.replace(/^dataset:/, '');
  for (const [id, ix] of entities) if (id.startsWith(p) && p.length >= 8) return ix[kind];
  return [];
}

export function datasetEntity(ref: string): RawEnt | undefined {
  const head = ref.split('!')[0].replace(/^dataset:/, '');
  for (const [id, ix] of entities) if (id.startsWith(head)) return ix.byRef.get(ref);
  return undefined;
}

/** Loads archives and every dataset's detail; returns whether anything changed. */
export async function loadEvidence(): Promise<boolean> {
  const list = await server.get<ArchiveInfo[]>('/evidence');
  const ds = await server.get<{ id: string; present: number; imageCount: number }[]>('/datasets');
  let changed = list.length !== archives.size || ds.length !== datasets.size;
  archives.clear();
  for (const a of list) archives.set(a.sha256, a);
  for (const d of ds) {
    const known = datasets.get(d.id);
    if (known && known.present === d.present) continue;
    const detail = await server.get<DatasetDetail>(`/datasets/${d.id}`, 30_000);
    datasets.set(d.id, detail);
    indexDataset(detail);
    changed = true;
  }
  return changed;
}

/** For tests and offline builds. */
export function setDatasetsForTest(list: DatasetDetail[], archiveList: ArchiveInfo[] = []) {
  datasets.clear();
  entities.clear();
  archives.clear();
  for (const d of list) {
    datasets.set(d.id, d);
    indexDataset(d);
  }
  for (const a of archiveList) archives.set(a.sha256, a);
}
