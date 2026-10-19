// COCO datasets and public media (PL/server/datasets.ts). A dataset is identified by the SHA-256 of its manifest file,
// an image by the SHA-256 of its bytes. Only public datasets exist: the schema admits no other privacy class, and an
// image is registered only with a recorded hash and a public COCO source. Media bytes arrive through the importer,
// which verifies each one against its hash; fetching images from their public source (Perf Lab's materialize) is not
// ported, so the Kiln server makes no outbound request for the lab.
import { existsSync, readFileSync } from 'node:fs';
import { all, get, now, type Db } from '../db.ts';
import { mediaFile, SHA256_HEX, sha256, type Mime } from './files.ts';

type Json = Record<string, any>;

export interface DatasetSummary {
  id: string;
  name: string;
  format: 'coco';
  privacy: 'public';
  source: string;
  categories: string[];
  imageCount: number;
  annotationCount: number;
  /** images whose bytes the media store holds */
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
 * The public sources an image may name. COCO's own host serves a certificate for another name; the S3 path-style URL
 * serves the same objects. Kept as Perf Lab's admission rule for dataset images, although nothing fetches them here.
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
 * Registers a COCO selection with its provenance (per-image hashes, strata, negatives); returns its id. Throws if the
 * manifest's hash differs from the one the provenance records, or if an image lacks a hash or a public source. A known
 * dataset is left as it is. Not transactional: the caller wraps it with the archive row that names it (evidence.ts).
 */
export function registerCocoDataset(db: Db, manifestBytes: Uint8Array, provenance: Json, opts: { name: string; source: string; addedAt?: string }): string {
  const id = sha256(manifestBytes);
  if (provenance.selected_manifest_sha256 && provenance.selected_manifest_sha256 !== id)
    throw new Error(`manifest hashes to ${id}, but its provenance records ${provenance.selected_manifest_sha256}`);
  if (get(db, 'select 1 from lab_datasets where id = ?', id)) return id;
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as Json;
  const categories = new Map<number, string>(((manifest.categories ?? []) as Json[]).map((c) => [Number(c.id), String(c.name)]));
  const licenses = new Map<number, Json>(((manifest.licenses ?? []) as Json[]).map((l) => [Number(l.id), l]));
  const hashes = new Map<number, string>(((provenance.image_hashes ?? []) as Json[]).map((h) => [Number(h.id), String(h.sha256)]));
  const strata = new Map<number, { category: string; size: string }[]>();
  for (const s of (provenance.strata ?? []) as Json[])
    for (const imageId of (s.image_ids ?? []) as number[]) strata.set(imageId, [...(strata.get(imageId) ?? []), { category: String(s.category), size: String(s.size) }]);
  const negatives = new Set<number>(((provenance.negative_ids ?? []) as number[]).map(Number));

  const images = ((manifest.images ?? []) as Json[]).map((im) => {
    const imageId = Number(im.id);
    const hash = hashes.get(imageId);
    if (!hash || !SHA256_HEX.test(hash)) throw new Error(`image ${imageId} has no recorded SHA-256`);
    const sourceUrl = String(im.coco_url ?? '');
    if (!publicFetchUrl(sourceUrl)) throw new Error(`image ${imageId} has no public source (${sourceUrl || 'none'})`);
    const lic = licenses.get(Number(im.license));
    return {
      imageId, fileName: String(im.file_name), sha256: hash, width: Number(im.width), height: Number(im.height), license: lic ? String(lic.name) : null, licenseUrl: lic ? String(lic.url) : null,
      sourceUrl, pageUrl: im.flickr_url ? String(im.flickr_url) : null, strata: negatives.has(imageId) ? [] : (strata.get(imageId) ?? []),
    };
  });
  const annotations = ((manifest.annotations ?? []) as Json[]).map((a) => {
    const label = categories.get(Number(a.category_id));
    if (!label) throw new Error(`annotation ${a.id} has unknown category ${a.category_id}`);
    return { id: Number(a.id), imageId: Number(a.image_id), label, bbox: a.bbox as number[], area: Number(a.area), iscrowd: Boolean(a.iscrowd) };
  });

  db.prepare(
    `insert into lab_datasets (id, name, format, privacy, source, provenance_json, categories_json, image_count, annotation_count, added_at)
     values (?, ?, 'coco', 'public', ?, ?, ?, ?, ?, ?)`,
  ).run(id, opts.name, opts.source, JSON.stringify(provenance), JSON.stringify([...categories.values()]), images.length, annotations.length, opts.addedAt ?? now());
  const insImage = db.prepare(
    `insert into lab_dataset_images (dataset_id, image_id, file_name, sha256, width, height, license_name, license_url, source_url, page_url, strata_json)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const im of images) insImage.run(id, im.imageId, im.fileName, im.sha256, im.width, im.height, im.license, im.licenseUrl, im.sourceUrl, im.pageUrl, JSON.stringify(im.strata));
  const insAnn = db.prepare('insert into lab_dataset_annotations (dataset_id, id, image_id, category, bbox_json, area, iscrowd) values (?, ?, ?, ?, ?, ?, ?)');
  for (const a of annotations) insAnn.run(id, a.id, a.imageId, a.label, JSON.stringify(a.bbox), a.area, a.iscrowd ? 1 : 0);
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

const presentCount = (db: Db, id: string): number =>
  get<{ n: number }>(db, 'select count(*) as n from lab_dataset_images i join lab_media m on m.sha256 = i.sha256 where i.dataset_id = ?', id)?.n ?? 0;

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

export const listDatasets = (db: Db): DatasetSummary[] => all<DatasetRow>(db, 'select * from lab_datasets order by added_at, id').map((r) => summary(db, r));

export function getDataset(db: Db, id: string): DatasetDetail | undefined {
  const r = get<DatasetRow>(db, 'select * from lab_datasets where id = ?', id);
  if (!r) return undefined;
  const images = all<Json>(
    db,
    `select i.*, (m.sha256 is not null) as present from lab_dataset_images i left join lab_media m on m.sha256 = i.sha256
     where i.dataset_id = ? order by i.image_id`,
    id,
  ).map((i): DatasetImage => {
    const strata = JSON.parse(i.strata_json) as DatasetImage['strata'];
    return {
      imageId: i.image_id, fileName: i.file_name, sha256: i.sha256, width: i.width, height: i.height, license: i.license_name, licenseUrl: i.license_url,
      sourceUrl: i.source_url, pageUrl: i.page_url, strata, negative: strata.length === 0, present: Boolean(i.present),
    };
  });
  const annotations = all<Json>(db, 'select * from lab_dataset_annotations where dataset_id = ? order by image_id, id', id).map(
    (a): DatasetAnnotation => ({ id: a.id, imageId: a.image_id, label: a.category, bboxPx: JSON.parse(a.bbox_json), area: a.area, iscrowd: Boolean(a.iscrowd) }),
  );
  return { ...summary(db, r), provenance: JSON.parse(r.provenance_json) as Json, images, annotations };
}

// ── media ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface MediaRow {
  sha256: string;
  bytes: number;
  mime: Mime;
  privacy: 'public';
  source_url: string | null;
  added_at: string;
}

export type MediaRead = { ok: true; row: MediaRow; data: Buffer } | { ok: false; status: 400 | 403 | 404 | 500; error: string; reason: string };

/**
 * The bytes of a public media object, or why there are none. The hash is checked before it names a file, and the
 * bytes are checked against it before they are served: a file changed on disk is a 500, never a wrong image.
 */
export function readMedia(db: Db, dataDir: string, hash: string): MediaRead {
  if (!SHA256_HEX.test(hash)) return { ok: false, status: 400, error: 'bad_request', reason: 'not a SHA-256 (64 lowercase hex digits)' };
  const row = get<MediaRow>(db, 'select * from lab_media where sha256 = ?', hash);
  if (!row) return { ok: false, status: 404, error: 'not_found', reason: 'no such media; import its dataset first (pnpm --filter @kiln/server lab:import)' };
  // the schema admits only 'public'; this re-check is the route's own guarantee, not a second policy
  if (row.privacy !== 'public') return { ok: false, status: 403, error: 'forbidden', reason: 'only public media are served' };
  const file = mediaFile(dataDir, hash, row.mime);
  if (!existsSync(file)) return { ok: false, status: 404, error: 'not_found', reason: 'media row without bytes' };
  const data = readFileSync(file);
  if (sha256(data) !== hash) return { ok: false, status: 500, error: 'corrupt_media', reason: 'the stored bytes no longer hash to their name' };
  return { ok: true, row, data };
}
