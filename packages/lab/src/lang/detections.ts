/**
 * Detection comparison with the semantics of PR 1005's benchmarks/grounding_dino_quality.py (revision d59d9ad):
 * one-to-one same-label matching by maximum bipartite matching, tolerance bounds with an inclusive boundary,
 * and per-image coverage of human annotations at a fixed IoU with regular > ignored > crowd priority.
 * test/detections.test.ts holds the port to golden outputs of the Python functions.
 */

export type Box = [number, number, number, number];

export interface Detection {
  label: string;
  confidence: number;
  /** normalized x1, y1, x2, y2 */
  bbox: Box;
}

export interface GroundTruth {
  id: number;
  label: string;
  bbox: Box;
  iscrowd?: boolean;
  ignore?: boolean;
}

const cmpNum = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Python's sorted(key=(label, bbox, confidence)): code-point string order, then the box tuple, then confidence. */
export function ordered<T extends Detection>(ds: readonly T[]): T[] {
  return [...ds].sort((a, b) => cmpStr(a.label, b.label) || a.bbox.reduce((r, v, i) => r || cmpNum(v, b.bbox[i]!), 0) || cmpNum(a.confidence, b.confidence));
}

function validateBox(box: readonly number[]) {
  if (box.length !== 4 || !box.every(Number.isFinite)) throw new Error('Boxes must contain four finite coordinates');
  if (box[2]! <= box[0]! || box[3]! <= box[1]!) throw new Error('Boxes must have positive width and height');
}

function validateDetections(ds: readonly Detection[]) {
  for (const d of ds) {
    validateBox(d.bbox);
    if (!d.label || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) throw new Error('Detections require a label and finite confidence in [0, 1]');
  }
}

/** Deterministic augmenting paths (BFS per left vertex), preserving earlier matched left vertices. */
export function maximumMatching(edges: readonly (readonly number[])[]): Map<number, number> {
  const leftToRight = new Map<number, number>();
  const rightToLeft = new Map<number, number>();
  for (let root = 0; root < edges.length; root++) {
    const queue = [root];
    const parents = new Map<number, number>();
    const visited = new Set([root]);
    let freeRight: number | null = null;
    while (queue.length && freeRight === null) {
      const left = queue.shift()!;
      for (const right of edges[left]!) {
        if (parents.has(right)) continue;
        parents.set(right, left);
        if (!rightToLeft.has(right)) {
          freeRight = right;
          break;
        }
        const owner = rightToLeft.get(right)!;
        if (!visited.has(owner)) {
          visited.add(owner);
          queue.push(owner);
        }
      }
    }
    if (freeRight === null) continue;
    let right = freeRight;
    for (;;) {
      const left = parents.get(right)!;
      const previous = leftToRight.get(left);
      leftToRight.set(left, right);
      rightToLeft.set(right, left);
      if (previous === undefined) break;
      right = previous;
    }
  }
  return leftToRight;
}

/** math.isclose(value, threshold, rel_tol=1e-12, abs_tol=0) admits subtraction noise at an inclusive boundary. */
const within = (value: number, threshold: number) =>
  value <= threshold || (threshold > 0 && Math.abs(value - threshold) <= 1e-12 * Math.max(Math.abs(value), Math.abs(threshold)));

const countLabels = (ds: readonly Detection[]) => {
  const m = new Map<string, number>();
  for (const d of ds) m.set(d.label, (m.get(d.label) ?? 0) + 1);
  return m;
};
const sameCounts = (a: Map<string, number>, b: Map<string, number>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

export interface Pairing {
  /** baseline index (in ordered()) → candidate index (in ordered()); valid pairs first, then diagnostic same-label pairs */
  pairs: Map<number, number>;
  /** baseline indices whose pair lies within both tolerances */
  valid: Set<number>;
  deltas: Map<string, [number, number]>;
}

/** The matching compare_detections builds, exposed so each detection can carry its verdict. */
export function pairDetections(baseline: readonly Detection[], candidate: readonly Detection[], boxTolerance = 0.001, confidenceTolerance = 0.01): Pairing & { before: Detection[]; after: Detection[] } {
  const before = ordered(baseline);
  const after = ordered(candidate);
  const deltas = new Map<string, [number, number]>();
  before.forEach((old, i) =>
    after.forEach((nw, j) => {
      if (old.label === nw.label) deltas.set(`${i},${j}`, [Math.max(...old.bbox.map((a, k) => Math.abs(a - nw.bbox[k]!))), Math.abs(old.confidence - nw.confidence)]);
    }),
  );
  const edges = before.map((_, i) =>
    after.map((__, j) => j).filter((j) => {
      const d = deltas.get(`${i},${j}`);
      return d !== undefined && within(d[0], boxTolerance) && within(d[1], confidenceTolerance);
    }),
  );
  const pairs = maximumMatching(edges);
  const valid = new Set(pairs.keys());
  const used = new Set(pairs.values());
  for (let i = 0; i < before.length; i++) {
    if (pairs.has(i)) continue;
    const options = after.map((_, j) => j).filter((j) => !used.has(j) && deltas.has(`${i},${j}`));
    if (!options.length) continue;
    // Python: min(options, key=lambda j: deltas[i, j]) — tuple order (box, confidence), first index on ties
    const j = options.reduce((best, o) => {
      const [a, b] = [deltas.get(`${i},${o}`)!, deltas.get(`${i},${best}`)!];
      return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? o : best;
    });
    pairs.set(i, j);
    used.add(j);
  }
  return { before, after, pairs, valid, deltas };
}

export interface CompareResult {
  passed: boolean;
  exact_equal: boolean;
  baseline_count: number;
  candidate_count: number;
  label_counts_equal: boolean;
  matched_count: number;
  unmatched_baseline_count: number;
  unmatched_candidate_count: number;
  max_box_edge_delta: number;
  max_confidence_delta: number;
  box_tolerance: number;
  confidence_tolerance: number;
  failures: string[];
}

const sameDetection = (a: Detection, b: Detection) => a.label === b.label && a.confidence === b.confidence && a.bbox.every((v, k) => v === b.bbox[k]);

export function compareDetections(baseline: readonly Detection[], candidate: readonly Detection[], boxTolerance = 0.001, confidenceTolerance = 0.01): CompareResult {
  if (![boxTolerance, confidenceTolerance].every((v) => Number.isFinite(v) && v >= 0)) throw new Error('Tolerances must be finite and nonnegative');
  validateDetections(baseline);
  validateDetections(candidate);
  const { before, after, pairs, valid, deltas } = pairDetections(baseline, candidate, boxTolerance, confidenceTolerance);
  const countsBefore = countLabels(before);
  const countsAfter = countLabels(after);
  const countsEqual = sameCounts(countsBefore, countsAfter);
  const validMatches = valid.size;
  const selected = [...pairs].map(([i, j]) => deltas.get(`${i},${j}`)!);
  const common = [...countsBefore].reduce((a, [k, v]) => a + Math.min(v, countsAfter.get(k) ?? 0), 0);
  const failures: string[] = [];
  if (!countsEqual) failures.push('label_counts');
  if (validMatches < common) failures.push('numeric_tolerance');
  return {
    passed: countsEqual && validMatches === before.length,
    exact_equal: before.length === after.length && before.every((d, i) => sameDetection(d, after[i]!)),
    baseline_count: before.length,
    candidate_count: after.length,
    label_counts_equal: countsEqual,
    matched_count: validMatches,
    unmatched_baseline_count: before.length - validMatches,
    unmatched_candidate_count: after.length - validMatches,
    max_box_edge_delta: selected.reduce((m, d) => Math.max(m, d[0]), 0),
    max_confidence_delta: selected.reduce((m, d) => Math.max(m, d[1]), 0),
    box_tolerance: boxTolerance,
    confidence_tolerance: confidenceTolerance,
    failures,
  };
}

export function overlap(detection: Box, truth: Box, crowd = false): number {
  const inter = Math.max(0, Math.min(detection[2], truth[2]) - Math.max(detection[0], truth[0])) * Math.max(0, Math.min(detection[3], truth[3]) - Math.max(detection[1], truth[1]));
  const da = (detection[2] - detection[0]) * (detection[3] - detection[1]);
  const ta = (truth[2] - truth[0]) * (truth[3] - truth[1]);
  return inter / (crowd ? da : da + ta - inter);
}

export interface Evaluation {
  true_positives: number;
  false_negatives: number;
  false_positives: number;
  false_positives_by_label: Record<string, number>;
  ignored_detections: number;
  matched_gt_ids: number[];
  ground_truth_count: number;
  iou_threshold: number;
  /** index in ordered(detections) → the regular annotation it covers; not part of the Python result */
  assignment: Map<number, number>;
}

export function evaluateDetections(detections: readonly Detection[], truth: readonly GroundTruth[], iouThreshold = 0.5, preferredGtIds: readonly number[] = []): Evaluation {
  if (!Number.isFinite(iouThreshold) || iouThreshold <= 0 || iouThreshold > 1) throw new Error('IoU threshold must be finite and in (0, 1]');
  validateDetections(detections);
  if (new Set(truth.map((t) => t.id)).size !== truth.length) throw new Error('Ground truth IDs must be unique within an image');
  for (const t of truth) {
    validateBox(t.bbox);
    if (!t.label) throw new Error('Ground truth labels must be nonempty');
  }
  const predictions = ordered(detections);
  const preferred = new Set(preferredGtIds);
  const regular = truth.filter((t) => !t.ignore && !t.iscrowd).sort((a, b) => cmpNum(preferred.has(a.id) ? 0 : 1, preferred.has(b.id) ? 0 : 1) || cmpNum(a.id, b.id));
  const ignored = truth.filter((t) => t.ignore && !t.iscrowd).sort((a, b) => cmpNum(a.id, b.id));
  const crowds = truth.filter((t) => t.iscrowd);
  const edgesFor = (ts: GroundTruth[]) =>
    ts.map((t) =>
      predictions
        .map((_, j) => j)
        .filter((j) => predictions[j]!.label === t.label && within(iouThreshold, overlap(predictions[j]!.bbox, t.bbox)))
        .sort((a, b) => -overlap(predictions[a]!.bbox, t.bbox) - -overlap(predictions[b]!.bbox, t.bbox) || a - b),
    );
  const edges: number[][] = [...edgesFor(regular), ...edgesFor(ignored)];
  predictions.forEach((p, j) => {
    if (crowds.some((t) => p.label === t.label && within(iouThreshold, overlap(p.bbox, t.bbox, true)))) edges.push([j]);
  });
  const matching = maximumMatching(edges);
  const regularMatches = new Map([...matching].filter(([i]) => i < regular.length));
  const used = new Set(regularMatches.values());
  const ignoredIdx = new Set([...matching].filter(([i]) => i >= regular.length).map(([, j]) => j));
  const fp: Record<string, number> = {};
  predictions.forEach((p, j) => {
    if (!used.has(j) && !ignoredIdx.has(j)) fp[p.label] = (fp[p.label] ?? 0) + 1;
  });
  const assignment = new Map([...regularMatches].map(([i, j]) => [j, regular[i]!.id]));
  return {
    true_positives: regularMatches.size,
    false_negatives: regular.length - regularMatches.size,
    false_positives: Object.values(fp).reduce((a, b) => a + b, 0),
    false_positives_by_label: Object.fromEntries(Object.entries(fp).sort(([a], [b]) => cmpStr(a, b))),
    ignored_detections: ignoredIdx.size,
    matched_gt_ids: [...regularMatches.keys()].map((i) => regular[i]!.id).sort(cmpNum),
    ground_truth_count: regular.length,
    iou_threshold: iouThreshold,
    assignment,
  };
}

export function compareGroundTruth(baseline: readonly Detection[], candidate: readonly Detection[], truth: readonly GroundTruth[], iouThreshold = 0.5) {
  const before = evaluateDetections(baseline, truth, iouThreshold);
  const after = evaluateDetections(candidate, truth, iouThreshold, before.matched_gt_ids);
  const afterIds = new Set(after.matched_gt_ids);
  const newMisses = before.matched_gt_ids.filter((id) => !afterIds.has(id)).length;
  const newFalsePositives = Object.entries(after.false_positives_by_label).reduce((a, [label, n]) => a + Math.max(0, n - (before.false_positives_by_label[label] ?? 0)), 0);
  // Python pops matched_gt_ids out of both evaluations while computing new_misses
  const { matched_gt_ids: _b, ...beforeOut } = before;
  const { matched_gt_ids: _a, ...afterOut } = after;
  return { passed: newMisses === 0 && newFalsePositives === 0, no_new_misses: newMisses === 0, no_new_false_positives: newFalsePositives === 0, new_misses: newMisses, new_false_positives: newFalsePositives, baseline: beforeOut, candidate: afterOut };
}

/** Converts a COCO pixel [x, y, w, h] to a normalized corner box, as ground_truth_from_coco does. */
export const cocoBox = (b: readonly number[], width: number, height: number): Box => {
  const [x = Number.NaN, y = Number.NaN, w = Number.NaN, h = Number.NaN] = b;
  return [x / width, y / height, (x + w) / width, (y + h) / height];
};

export type DetectionStatus = 'exact' | 'within-tolerance' | 'changed' | 'added' | 'dropped';

/** A verdict for every detection of both arms, from the same matching compare_detections uses. */
export function verdicts(baseline: readonly Detection[], candidate: readonly Detection[]) {
  const { before, after, pairs, valid, deltas } = pairDetections(baseline, candidate);
  const base = before.map((d, i) => {
    const j = pairs.get(i);
    const status: DetectionStatus = j === undefined ? 'dropped' : !valid.has(i) ? 'changed' : sameDetection(d, after[j]!) ? 'exact' : 'within-tolerance';
    const delta = j === undefined ? undefined : deltas.get(`${i},${j}`);
    return { detection: d, status, counterpart: j, boxDelta: delta?.[0], confDelta: delta?.[1] };
  });
  const back = new Map([...pairs].map(([i, j]) => [j, i]));
  const cand = after.map((d, j) => {
    const i = back.get(j);
    const status: DetectionStatus = i === undefined ? 'added' : base[i]!.status;
    return { detection: d, status, counterpart: i, boxDelta: i === undefined ? undefined : base[i]!.boxDelta, confDelta: i === undefined ? undefined : base[i]!.confDelta };
  });
  return { baseline: base, candidate: cand };
}
