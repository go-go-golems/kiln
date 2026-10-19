import type { OverlayLayer } from '@/components/molecules/DetectionOverlay/DetectionOverlay';
import type { DataSource, Ent } from '@/lang/rows';

/** A dataset handle (dataset('…')), a hash or a ref prefix → the manifest hash. */
export const datasetSha = (x: unknown): string => (x && typeof x === 'object' && 'sha256' in x ? String((x as { sha256: unknown }).sha256) : String(x ?? ''));

const ARM_ORDER = ['baseline', 'candidate'];
const ARM_STYLE: Record<string, { color: string; weight: number }> = {
  baseline: { color: 'var(--d-baseline)', weight: 4 },
  candidate: { color: 'var(--d-candidate)', weight: 1.5 },
};
const OTHER = ['var(--d3)', 'var(--d4)', 'var(--d5)', 'var(--d6)'];

export interface ImageEvidence {
  image: Ent | undefined;
  truth: Ent[];
  /** per arm: whether the arm's prediction run recorded this image, and its detections */
  arms: { arm: string; experiment: string; run: string; recorded: boolean; detections: Ent[] }[];
}

/** Everything the views know about one image: its annotations and each prediction run's record of it. */
export function evidenceFor(source: DataSource, ds: string, imageId: number, runs: string | undefined): ImageEvidence {
  const image = source.entities('image', ds).find((i) => i.imageId === imageId);
  const truth = source.entities('annotation', ds).filter((a) => a.image === imageId && !a.iscrowd);
  const arms = runs
    ? source
        .runs(runs)
        .sort((a, b) => armRank(String(a.arm)) - armRank(String(b.arm)))
        .map((r) => ({
          arm: String(r.arm),
          experiment: String(r.experiment),
          run: r.ref,
          recorded: source.entities('instant', r.ref).some((i) => i.type === 'predictions.image' && i.image === imageId),
          detections: source.entities('detection', r.ref).filter((d) => d.image === imageId),
        }))
    : [];
  return { image, truth, arms };
}

const armRank = (a: string) => (ARM_ORDER.includes(a) ? ARM_ORDER.indexOf(a) : ARM_ORDER.length);

const fmt = (d: Ent) => `${String(d.label)} ${Number(d.confidence).toFixed(3)}`;

export function layersFor(ev: ImageEvidence, opts: { truth?: boolean; diff?: boolean } = {}): OverlayLayer[] {
  const layers: OverlayLayer[] = [];
  if (opts.truth !== false)
    layers.push({ key: 'truth', label: 'ground truth', color: 'var(--on-ink)', dashed: true, weight: 1.5, boxes: ev.truth.map((a) => ({ ref: a.ref, bbox: a.bbox as number[], text: String(a.label) })) });
  // runs from different experiments may share an arm name (the candidate on two hosts): name them by experiment then
  const seen = new Set<string>();
  const shared = new Set(ev.arms.filter((a) => (seen.has(a.arm) ? true : (seen.add(a.arm), false))).map((a) => a.arm));
  let other = 0;
  const used = new Set<string>();
  ev.arms.forEach((a) => {
    // colour is never the only difference: a further run is also dotted
    const style = !used.has(a.arm) && ARM_STYLE[a.arm] ? ARM_STYLE[a.arm] : { color: OTHER[other++ % OTHER.length], weight: 2, dotted: true };
    used.add(a.arm);
    const dets = opts.diff ? a.detections.filter((d) => d.status !== 'exact') : a.detections;
    layers.push({ key: a.run, label: shared.has(a.arm) ? `${a.experiment} · ${a.arm}` : a.arm, ...style, boxes: dets.map((d) => ({ ref: d.ref, bbox: d.bbox as number[], text: fmt(d) })) });
  });
  return layers;
}

/** One word for an image across arms: what a reviewer needs before opening it. */
export function verdictOf(ev: ImageEvidence): 'exact' | 'differs' | 'digest only' | 'no runs' {
  if (!ev.arms.length) return 'no runs';
  if (!ev.arms.every((a) => a.recorded)) return 'digest only';
  return ev.arms.every((a) => a.detections.every((d) => d.status === 'exact')) ? 'exact' : 'differs';
}
