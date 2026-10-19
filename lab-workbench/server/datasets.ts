import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { all, get, now, run, tx, type Db } from './db';

/**
 * Datasets are identified by the SHA-256 of their manifest file, images by the SHA-256 of their bytes.
 * Only public datasets exist: the schema admits no other privacy class, images are fetched only from the
 * public hosts below, and every fetched byte is verified against the hash the dataset recorded.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

export interface DatasetSummary {
  id: string;
  name: string;
  format: 'coco';
  privacy: 'public';
  source: string;
  categories: string[];
  imageCount: number;
  annotationCount: number;
  present: number;
  addedAt: string;
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
  /** the strata the selection placed this image in; empty for a negative */
  strata: { category: string; size: string }[];
  negative: boolean;
  present: boolean;
}

export interface DatasetAnnotation {
  id: number;
  imageId: number;
  label: string;
  /** COCO pixel box [x, y, w, h] */
  bboxPx: [number, number, number, number];
  area: number;
  iscrowd: boolean;
}

export interface DatasetDetail extends DatasetSummary {
  provenance: Json;
  images: DatasetImage[];
  annotations: DatasetAnnotation[];
}

/**
 * COCO's own host serves a certificate for another name (the DGX preparation hit the same TLS failure);
 * the S3 path-style URL serves the same objects over valid TLS. The hash check makes the transport irrelevant
 * to integrity, but not to who we talk to: only these prefixes are ever fetched.
 */
const PUBLIC_SOURCES: { match: RegExp; fetchUrl: (m: RegExpExecArray) => string }[] = [
  { match: /^https?:\/\/images\.cocodataset\.org\/([a-z0-9]+\/[0-9]+\.jpg)$/, fetchUrl: (m) => `https://s3.amazonaws.com/images.cocodataset.org/${m[1]}` },
  { match: /^https:\/\/s3\.amazonaws\.com\/images\.cocodataset\.org\/([a-z0-9]+\/[0-9]+\.jpg)$/, fetchUrl: (m) => `https://s3.amazonaws.com/images.cocodataset.org/${m[1]}` },
];

export function publicFetchUrl(sourceUrl: string): string | null {
  for (const s of PUBLIC_SOURCES) {
    const m = s.match.exec(sourceUrl);
    if (m) return s.fetchUrl(m);
  }
  return null;
}

/**
 * Registers a COCO-format selection with its provenance (per-image hashes, strata, negatives). Fails if the
 * manifest's hash differs from the one the provenance recorded, or if any image lacks a hash or a public source.
 */
export function registerCocoDataset(db: Db, manifestBytes: Uint8Array, provenance: Json, opts: { name: string; source: string }): string {
  const id = sha256(manifestBytes);
  if (provenance.selected_manifest_sha256 && provenance.selected_manifest_sha256 !== id)
    throw new Error(`manifest hashes to ${id}, but its provenance records ${provenance.selected_manifest_sha256}`);
  if (get(db, 'select 1 from datasets where id = ?', id)) return id;
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as Json;
  const categories = new Map<number, string>((manifest.categories as Json[]).map((c) => [Number(c.id), String(c.name)]));
  const licenses = new Map<number, Json>(((manifest.licenses ?? []) as Json[]).map((l) => [Number(l.id), l]));
  const hashes = new Map<number, string>(((provenance.image_hashes ?? []) as Json[]).map((h) => [Number(h.id), String(h.sha256)]));
  const strata = new Map<number, { category: string; size: string }[]>();
  for (const s of (provenance.strata ?? []) as Json[])
    for (const imageId of s.image_ids as number[]) strata.set(imageId, [...(strata.get(imageId) ?? []), { category: String(s.category), size: String(s.size) }]);
  const negatives = new Set<number>(((provenance.negative_ids ?? []) as number[]).map(Number));

  const images = (manifest.images as Json[]).map((im) => {
    const imageId = Number(im.id);
    const hash = hashes.get(imageId);
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new Error(`image ${imageId} has no recorded SHA-256`);
    const sourceUrl = String(im.coco_url ?? '');
    if (!publicFetchUrl(sourceUrl)) throw new Error(`image ${imageId} has no public source (${sourceUrl || 'none'})`);
    const lic = licenses.get(Number(im.license));
    return { imageId, fileName: String(im.file_name), sha256: hash, width: Number(im.width), height: Number(im.height), license: lic ? String(lic.name) : null, licenseUrl: lic ? String(lic.url) : null, sourceUrl, pageUrl: im.flickr_url ? String(im.flickr_url) : null, strata: strata.get(imageId) ?? [], negative: negatives.has(imageId) };
  });
  const annotations = (manifest.annotations as Json[]).map((a) => {
    const label = categories.get(Number(a.category_id));
    if (!label) throw new Error(`annotation ${a.id} has unknown category ${a.category_id}`);
    return { id: Number(a.id), imageId: Number(a.image_id), label, bbox: a.bbox as number[], area: Number(a.area), iscrowd: Boolean(a.iscrowd) };
  });

  tx(db, () => {
    run(
      db,
      `insert into datasets (id, name, format, privacy, source, provenance_json, categories_json, image_count, annotation_count, added_at)
       values (?, ?, 'coco', 'public', ?, ?, ?, ?, ?, ?)`,
      id, opts.name, opts.source, JSON.stringify(provenance), JSON.stringify([...categories.values()]), images.length, annotations.length, now(),
    );
    const insImage = db.prepare(
      `insert into dataset_images (dataset_id, image_id, file_name, sha256, width, height, license_name, license_url, source_url, page_url, strata_json)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const im of images)
      insImage.run(id, im.imageId, im.fileName, im.sha256, im.width, im.height, im.license, im.licenseUrl, im.sourceUrl, im.pageUrl, JSON.stringify(im.negative ? [] : im.strata));
    const insAnn = db.prepare('insert into dataset_annotations (dataset_id, id, image_id, category, bbox_json, area, iscrowd) values (?, ?, ?, ?, ?, ?, ?)');
    for (const a of annotations) insAnn.run(id, a.id, a.imageId, a.label, JSON.stringify(a.bbox), a.area, a.iscrowd ? 1 : 0);
  });
  return id;
}

interface DatasetRow {
  id: string;
  name: string;
  format: 'coco';
  privacy: 'public';
  source: string;
  provenance_json: string;
  categories_json: string;
  image_count: number;
  annotation_count: number;
  added_at: string;
}

const presentCount = (db: Db, id: string) =>
  get<{ n: number }>(db, 'select count(*) as n from dataset_images i join media m on m.sha256 = i.sha256 where i.dataset_id = ?', id)?.n ?? 0;

const summary = (db: Db, r: DatasetRow): DatasetSummary => ({
  id: r.id,
  name: r.name,
  format: r.format,
  privacy: r.privacy,
  source: r.source,
  categories: JSON.parse(r.categories_json) as string[],
  imageCount: r.image_count,
  annotationCount: r.annotation_count,
  present: presentCount(db, r.id),
  addedAt: r.added_at,
});

export const listDatasets = (db: Db): DatasetSummary[] => all<DatasetRow>(db, 'select * from datasets order by added_at').map((r) => summary(db, r));

export function getDataset(db: Db, id: string): DatasetDetail | undefined {
  const r = get<DatasetRow>(db, 'select * from datasets where id = ?', id);
  if (!r) return undefined;
  const images = all<Json>(
    db,
    `select i.*, (m.sha256 is not null) as present from dataset_images i left join media m on m.sha256 = i.sha256
     where i.dataset_id = ? order by i.image_id`,
    id,
  ).map((i): DatasetImage => {
    const strata = JSON.parse(i.strata_json) as DatasetImage['strata'];
    return {
      imageId: i.image_id, fileName: i.file_name, sha256: i.sha256, width: i.width, height: i.height, license: i.license_name, licenseUrl: i.license_url,
      sourceUrl: i.source_url, pageUrl: i.page_url, strata, negative: strata.length === 0, present: Boolean(i.present),
    };
  });
  const annotations = all<Json>(db, 'select * from dataset_annotations where dataset_id = ? order by image_id, id', id).map(
    (a): DatasetAnnotation => ({ id: a.id, imageId: a.image_id, label: a.category, bboxPx: JSON.parse(a.bbox_json), area: a.area, iscrowd: Boolean(a.iscrowd) }),
  );
  return { ...summary(db, r), provenance: JSON.parse(r.provenance_json), images, annotations };
}

// ── media ───────────────────────────────────────────────────────────────────────────────────

export const mediaDir = (dataDir: string) => join(dataDir, 'media');
const mediaFile = (dataDir: string, hash: string, mime: string) => join(mediaDir(dataDir), `${hash}.${mime === 'image/png' ? 'png' : 'jpg'}`);

export interface MediaRow {
  sha256: string;
  bytes: number;
  mime: string;
  privacy: 'public';
  source_url: string | null;
}

/** The bytes of a public media object, or why there are none. */
export function readMedia(db: Db, dataDir: string, hash: string): { ok: true; row: MediaRow; data: Buffer } | { ok: false; status: 400 | 403 | 404; reason: string } {
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, status: 400, reason: 'not a SHA-256' };
  const row = get<MediaRow>(db, 'select * from media where sha256 = ?', hash);
  if (!row) return { ok: false, status: 404, reason: 'no such media; materialize its dataset first' };
  // the schema admits only 'public'; this re-check is the route's own guarantee, not a second policy
  if (row.privacy !== 'public') return { ok: false, status: 403, reason: 'only public media are served by the lab server' };
  const file = mediaFile(dataDir, hash, row.mime);
  if (!existsSync(file)) return { ok: false, status: 404, reason: 'media row without bytes' };
  return { ok: true, row, data: readFileSync(file) };
}

const mimeOf = (data: Uint8Array): string | null =>
  data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 ? 'image/png' : null;

export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export interface MaterializeResult {
  datasetId: string;
  total: number;
  present: number;
  fetched: number;
  failed: { imageId: number; reason: string }[];
}

const MAX_IMAGE_BYTES = 16 * 2 ** 20;

/**
 * Fetches every image of a dataset that the media store lacks, verifies its SHA-256 and stores it. An image
 * whose bytes differ is reported and not stored.
 */
export async function materialize(
  db: Db,
  dataDir: string,
  id: string,
  opts: { fetch?: Fetcher; concurrency?: number; onProgress?: (p: { present: number; total: number; imageId: number }) => void } = {},
): Promise<MaterializeResult> {
  const ds = getDataset(db, id);
  if (!ds) throw new Error(`no dataset ${id}`);
  const doFetch: Fetcher = opts.fetch ?? ((url, init) => fetch(url, init));
  mkdirSync(mediaDir(dataDir), { recursive: true });
  const missing = ds.images.filter((i) => !i.present);
  const result: MaterializeResult = { datasetId: id, total: ds.images.length, present: ds.images.length - missing.length, fetched: 0, failed: [] };
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const im = missing[next++];
      const url = publicFetchUrl(im.sourceUrl);
      try {
        if (!url) throw new Error(`no public source for ${im.sourceUrl}`);
        const res = await doFetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        if (data.byteLength > MAX_IMAGE_BYTES) throw new Error(`${data.byteLength} bytes exceeds the ${MAX_IMAGE_BYTES} byte limit`);
        const actual = sha256(data);
        if (actual !== im.sha256) throw new Error(`bytes hash to ${actual.slice(0, 12)}…, the dataset records ${im.sha256.slice(0, 12)}…`);
        const mime = mimeOf(data);
        if (!mime) throw new Error('neither JPEG nor PNG');
        writeFileSync(mediaFile(dataDir, im.sha256, mime), data);
        run(db, `insert into media (sha256, bytes, mime, privacy, source_url, added_at) values (?, ?, ?, 'public', ?, ?) on conflict (sha256) do nothing`, im.sha256, data.byteLength, mime, url, now());
        result.fetched++;
        result.present++;
        opts.onProgress?.({ present: result.present, total: result.total, imageId: im.imageId });
      } catch (e) {
        result.failed.push({ imageId: im.imageId, reason: (e as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
  return result;
}
