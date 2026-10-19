import type { CaptureInstance } from '../lang/env.ts';
import { makeEnt, type DataSource, type Ent, type EntityKind, type Link, type RawEnt } from '../lang/rows.ts';
import { globToRegExp } from '../lang/util.ts';
import { generateRun, type GeneratedRun } from './generate.ts';

// The data layer behind the query engine. Ported from Perf Lab (PL/src/data/source.ts) unchanged in behaviour: only
// captures the artifact store holds are visible, synthetic and measured runs share one shape, and dataset-scoped
// entities (image, annotation) come from a DatasetProvider.

/** Generated runs, shared across builds: identical content hash + repetition ⇒ identical data. */
const runCache = new Map<string, GeneratedRun>();

export function generatedRun(inst: CaptureInstance, rep: number): GeneratedRun {
  const key = `${inst.hash}#${rep}`;
  let run = runCache.get(key);
  if (!run) {
    run = generateRun(inst, rep);
    runCache.set(key, run);
  }
  return run;
}

interface RunSlot {
  ref: string;
  inst: CaptureInstance;
  rep: number;
}

/** Where a repetition's run comes from: generated from the hash, or measured and fetched from the server. */
export interface RunProvider {
  has(inst: CaptureInstance, rep: number): boolean;
  get(inst: CaptureInstance, rep: number): GeneratedRun;
}

export const syntheticRuns: RunProvider = { has: () => true, get: generatedRun };

/** Entities that belong to a dataset rather than a run (image, annotation); refs start with `dataset:`. */
export interface DatasetProvider {
  entities(kind: 'image' | 'annotation', pattern: string): RawEnt[];
  entity(ref: string): RawEnt | undefined;
}

const DATASET_KINDS = new Set<EntityKind>(['image', 'annotation']);

/** The synthetic data layer: every available capture's repetitions are generated from its hash. */
export const createSyntheticSource = (instances: CaptureInstance[], isAvailable: (hash: string) => boolean) => createSource(instances, isAvailable, syntheticRuns);

/**
 * The data layer behind the query engine. Only captures the artifact store holds are visible, so a pending
 * plan genuinely has no evidence until its job imports; synthetic and measured runs share one shape.
 */
export function createSource(instances: CaptureInstance[], isAvailable: (hash: string) => boolean, provider: RunProvider, datasets?: DatasetProvider): DataSource {
  const slots: RunSlot[] = [];
  for (const inst of instances) {
    if (inst.status === 'blocked' || !isAvailable(inst.hash)) continue;
    for (let rep = 0; rep < inst.reps; rep++) if (provider.has(inst, rep)) slots.push({ ref: `${inst.ref}#${rep}`, inst, rep });
  }
  const bySlotRef = new Map(slots.map((s) => [s.ref, s]));
  const ents = new Map<string, Ent>();
  const indexes = new Map<string, { byRef: Map<string, Ent>; byKind: Map<EntityKind, Ent[]>; fwd: Map<string, Link[]>; back: Map<string, Link[]> }>();

  let source: DataSource;

  const index = (slot: RunSlot) => {
    let ix = indexes.get(slot.ref);
    if (ix) return ix;
    const gen = provider.get(slot.inst, slot.rep);
    const byRef = new Map<string, Ent>();
    const byKind = new Map<EntityKind, Ent[]>();
    for (const raw of gen.entities) {
      const e = makeEnt(raw, source);
      byRef.set(raw.ref, e);
      const list = byKind.get(raw.kind);
      if (list) list.push(e);
      else byKind.set(raw.kind, [e]);
    }
    const fwd = new Map<string, Link[]>();
    const back = new Map<string, Link[]>();
    for (const l of gen.links) {
      (fwd.get(l.from) ?? fwd.set(l.from, []).get(l.from)!).push(l);
      (back.get(l.to) ?? back.set(l.to, []).get(l.to)!).push(l);
    }
    ix = { byRef, byKind, fwd, back };
    indexes.set(slot.ref, ix);
    return ix;
  };

  const runEnt = (slot: RunSlot): Ent => {
    let e = ents.get(slot.ref);
    if (!e) {
      e = makeEnt(provider.get(slot.inst, slot.rep).run, source);
      ents.set(slot.ref, e);
    }
    return e;
  };

  const match = (pattern: string) => {
    const p = pattern.includes('#') ? pattern : `${pattern}#*`;
    if (bySlotRef.has(p)) return [bySlotRef.get(p)!];
    const re = globToRegExp(p);
    return slots.filter((s) => re.test(s.ref));
  };

  const datasetEnts = new Map<string, Ent>();
  const datasetEnt = (raw: RawEnt) => {
    let e = datasetEnts.get(raw.ref);
    if (!e) {
      e = makeEnt(raw, source);
      datasetEnts.set(raw.ref, e);
    }
    return e;
  };

  source = {
    runs: (pattern) => match(pattern).map(runEnt),
    entities: (kind, pattern) => {
      if (kind === 'run') return match(pattern).map(runEnt);
      if (DATASET_KINDS.has(kind)) return (datasets?.entities(kind as 'image' | 'annotation', pattern) ?? []).map(datasetEnt);
      return match(pattern).flatMap((s) => index(s).byKind.get(kind) ?? []);
    },
    entity: (ref) => {
      if (!ref) return undefined;
      if (ref.startsWith('dataset:')) {
        const raw = datasets?.entity(ref);
        return raw ? datasetEnt(raw) : undefined;
      }
      const runRef = ref.split('!')[0] ?? ref;
      const slot = bySlotRef.get(runRef);
      if (!slot) return undefined;
      if (!ref.includes('!')) return runEnt(slot);
      return index(slot).byRef.get(ref);
    },
    links: (ref, rel, dir) => {
      const slot = bySlotRef.get(ref.split('!')[0] ?? ref);
      if (!slot) return [];
      const ix = index(slot);
      const list = (dir === 'fwd' ? ix.fwd : ix.back).get(ref) ?? [];
      return rel ? list.filter((l) => l.rel === rel) : list;
    },
  };
  return source;
}
