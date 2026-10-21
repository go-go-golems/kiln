// nsys (guide §20.5): Nsight Systems wraps the step's process; a post-step exports the trace to SQLite, and the
// server reads that export (readNsys) into kernel, copy, range and runtime-call entities. A kernel whose name has the
// form <name>__<identity> (Kiln's entry symbols) is linked to that Kiln identity: the bridge between a kernel span in a
// program or a service trace and the isolated records of the same computation.
import type { Observation } from '../model.ts';
import type { Collector, NsysTables } from '../registry.ts';

export const NSYS_MAX_OUTPUT = 2 ** 30;
const COPY_KINDS: Record<number, string> = { 1: 'HtoD', 2: 'DtoH', 3: 'HtoA', 4: 'AtoH', 5: 'AtoA', 6: 'AtoD', 7: 'DtoA', 8: 'DtoD', 9: 'HtoH', 10: 'PtoP' };

/** `<name>__<identity>` → identity; Kiln identities are hex digests or readable keys without whitespace. */
export const kilnIdentityOf = (kernel: string): string | null => /__([A-Za-z0-9_.:-]{6,})$/.exec(kernel)?.[1] ?? null;

type Ent = Record<string, unknown> & { kind: string; id: string };
type LinkDraft = { from: string; to: string; rel: string; evidence: string; method?: string };

/** Entities and links of one trace, attributed to the captures a step served (by kernel symbol where it can be told). */
export function nsysEntities(t: NsysTables, serves: readonly { capture: string; rep: number }[], symbols: ReadonlyMap<string, { capture: string; rep: number }>) {
  const per = new Map<string, { s: { capture: string; rep: number }; entities: Ent[]; links: LinkDraft[] }>();
  const bucket = (s: { capture: string; rep: number }) => {
    const k = `${s.capture}#${s.rep}`;
    let b = per.get(k);
    if (!b) per.set(k, (b = { s, entities: [], links: [] }));
    return b;
  };
  const first = serves[0];
  if (!first) return [];
  const t0 = Math.min(...[...t.kernels.map((k) => k.start), ...t.calls.map((c) => c.start), ...t.ranges.map((r) => r.start), ...t.copies.map((c) => c.start)].filter(Number.isFinite), Infinity);
  const rel = (ns: number) => (Number.isFinite(t0) ? ns - t0 : ns);
  const owner = new Map<number, { capture: string; rep: number }>();
  t.kernels.forEach((k, i) => {
    const s = symbols.get(k.name) ?? (symbols.size === 0 || serves.length === 1 ? first : symbols.get(k.name.replace(/\(.*$/, '')) ?? first);
    owner.set(k.correlationId, s);
    const identity = kilnIdentityOf(k.name);
    const e: Ent = {
      kind: 'kernel', id: `k${String(i).padStart(6, '0')}`, name: k.name, lane: `gpu:${k.deviceId}/stream:${k.streamId}`,
      start: rel(k.start), end: rel(k.end), dur: (k.end - k.start) / 1e6, grid: `[${k.grid.join(',')}]`, block: `[${k.block.join(',')}]`,
      registers: k.registers, correlationId: k.correlationId, ...(identity ? { kilnIdentity: identity } : {}),
    };
    const b = bucket(s);
    b.entities.push(e);
    if (identity) b.links.push({ from: `kernel:${e.id}`, to: `kiln:identity:${identity}`, rel: 'corresponds_to', evidence: 'direct', method: 'kernel name <name>__<identity>' });
  });
  t.copies.forEach((c, i) => {
    bucket(first).entities.push({
      kind: 'kernel', id: `m${String(i).padStart(6, '0')}`, name: `memcpy ${COPY_KINDS[c.copyKind] ?? c.copyKind}`, role: 'copy',
      lane: `gpu:${c.deviceId}/stream:${c.streamId}`, start: rel(c.start), end: rel(c.end), dur: (c.end - c.start) / 1e6, bytes: c.bytes,
    });
  });
  t.calls.forEach((c, i) => {
    const s = owner.get(c.correlationId);
    const e: Ent = { kind: 'span', id: `c${String(i).padStart(6, '0')}`, name: c.name, lane: `cpu:${c.tid}`, start: rel(c.start), end: rel(c.end), dur: (c.end - c.start) / 1e6, correlationId: c.correlationId };
    const b = bucket(s ?? first);
    b.entities.push(e);
    if (s) {
      const k = b.entities.find((x) => x.kind === 'kernel' && x.correlationId === c.correlationId);
      if (k) b.links.push({ from: `span:${e.id}`, to: `kernel:${k.id}`, rel: 'launches', evidence: 'direct', method: 'CUPTI correlation id' });
    }
  });
  t.ranges.forEach((r, i) => {
    bucket(first).entities.push({ kind: 'span', id: `r${String(i).padStart(6, '0')}`, name: r.text, lane: `cpu:${r.tid}`, start: rel(r.start), end: rel(r.end ?? r.start), dur: ((r.end ?? r.start) - r.start) / 1e6, nvtx: true });
  });
  return [...per.values()].map((b): Observation => ({ type: 'entities', capture: b.s.capture, rep: b.s.rep, entities: b.entities, links: b.links }));
}

export const nsys: Collector = {
  id: 'nsys', title: 'Nsight Systems timeline', shape: 'wrapper',
  requires: [{ tool: 'nsys' }],
  disturbs: ['latency'],
  exclusive: ['ncu'],
  apply(step, ctx) {
    const t = ctx.tool('nsys');
    const bin = t?.bin ?? 'nsys';
    const range = ctx.kind.nvtxRange ? ['--capture-range=nvtx', `--nvtx-capture=${ctx.kind.nvtxRange}`, '--capture-range-end=stop'] : [];
    return {
      ...step,
      wrap: [bin, 'profile', '--trace=cuda,nvtx,osrt', '--sample=none', '--cpuctxsw=none', ...range, '--output', '/job/out/trace', '--force-overwrite', 'true', '--', ...step.wrap],
      post: [bin, 'export', '--type', 'sqlite', '--force-overwrite', 'true', '--output', '/job/out/trace.sqlite', '/job/out/trace.nsys-rep'],
      mounts: t?.mount ? [...step.mounts, { role: 'tool', source: t.mount, target: t.mount, ro: true }] : step.mounts,
      maxOutputBytes: Math.max(step.maxOutputBytes, NSYS_MAX_OUTPUT),
    };
  },
  import(out, ctx) {
    const err = (message: string) => out.step.serves.map((s): Observation => ({ type: 'error', capture: s.capture, rep: s.rep, message }));
    const data = out.files.get('trace.sqlite');
    if (!data) return err(`nsys wrote no trace.sqlite${out.execution?.postExit ? ` (export exited with ${out.execution.postExit})` : ''}`);
    if (!ctx.readNsys) return err('this importer cannot read nsys exports');
    let tables: NsysTables | null;
    try {
      tables = ctx.readNsys(data);
    } catch (e) {
      return err(`reading trace.sqlite: ${(e as Error).message}`);
    }
    if (!tables) return err('trace.sqlite holds none of the tables nsys exports');
    const symbols = new Map<string, { capture: string; rep: number }>();
    for (const s of out.step.serves) for (const sym of ctx.captures.get(s.capture)?.symbols ?? []) symbols.set(sym, s);
    return nsysEntities(tables, out.step.serves, symbols);
  },
};
