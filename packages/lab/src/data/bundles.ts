// Measured runs as the lab server stores and serves them. Perf Lab's bundles.ts also fetched them (GET /bundles) and
// cached them in a module Map; here the cache is the LabData that holds them (lab-data.ts), and fetching is the
// caller's job (Phase 8b's client of /api/lab/bundles, or the Node reader of Perf Lab's store).
import type { Link } from '../lang/rows.ts';
import { revive } from '../lang/values.ts';
import type { GeneratedRun, RawEntity } from './generate.ts';

/** One repetition of a measured capture: its run entity, its entities and their links. Same shape as a generated run. */
export type RunBundle = GeneratedRun;

/** A bundle as JSON (GET /api/lab/bundles?hashes=… returns `{ [hash]: BundleJSON[] }`, ordered by repetition). */
export interface BundleJSON {
  run: Record<string, unknown>;
  entities: Record<string, unknown>[];
  links: Link[];
}

/** JSON bundles → bundles whose Values are evidence Values again (see `revive`). */
export const reviveBundles = (runs: readonly BundleJSON[]): RunBundle[] =>
  runs.map((b) => ({
    run: revive(b.run) as RawEntity,
    entities: revive(b.entities) as RawEntity[],
    links: b.links.map((l) => ({ ...l })),
  }));
