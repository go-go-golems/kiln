// The workload kinds this server knows (guide §19). Adding a kind is one module here plus, if it needs one, an entry
// point inside an environment.
import type { WorkloadKind } from '../registry.ts';
import { kilnKernels } from './kiln-kernels.ts';

export const KINDS: readonly WorkloadKind[] = [kilnKernels as WorkloadKind];
export const kindById: ReadonlyMap<string, WorkloadKind> = new Map(KINDS.map((k) => [k.id, k]));
