import type { Patch } from '@/lang/build';
import type { BuildRegistry } from '@/lang/runtime';

/**
 * Builds hold builders, lambdas and data sources, none of which belong in Redux. Redux keeps the
 * serializable IR and the build id; components look the registry up here.
 */
const builds = new Map<string, BuildRegistry>();
const order: string[] = [];
const KEEP = 24;

export function registerBuild(reg: BuildRegistry) {
  builds.set(reg.buildId, reg);
  order.push(reg.buildId);
  while (order.length > KEEP) builds.delete(order.shift()!);
}

export const getRegistry = (buildId: string | undefined): BuildRegistry | undefined => (buildId ? builds.get(buildId) : undefined);

/** Agent-made program patches (forks, capture edits), re-applied on every build of a lab. */
const patches = new Map<string, Patch[]>();
export const getPatches = (labId: string): Patch[] => patches.get(labId) ?? [];
export const addPatch = (labId: string, patch: Patch) => patches.set(labId, [...getPatches(labId), patch]);
export const setPatches = (labId: string, list: Patch[]) => patches.set(labId, list);
