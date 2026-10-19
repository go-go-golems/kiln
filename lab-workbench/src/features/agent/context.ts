import type { RootState } from '@/app/store';
import { getRegistry } from '@/app/registry';

/**
 * What the live model is told about the board in view: a compact summary, not the IR. Everything here is
 * readable by the person in the same UI; nothing is a credential.
 */
export function boardContext(s: RootState, labId: string, boardId: string): Record<string, unknown> {
  const lb = s.build.byLab[labId];
  const ir = lb?.ir;
  if (!ir) return { lab: { id: labId }, board: { id: boardId }, note: 'the lab has not been built' };
  const board = ir.boards.find((b) => b.id === boardId);
  const reg = getRegistry(lb.buildId ?? undefined);
  const applied = s.params.byLab[labId]?.applied ?? {};
  const pending = s.params.byLab[labId]?.pending;
  const runsOf = (exp: string) => {
    const runs = reg?.source.runs(`${exp}/*/*`) ?? [];
    return {
      total: runs.length,
      measured: runs.filter((r) => r.synthetic === false).length,
      refs: runs.slice(0, 24).map((r) => r.ref),
      invalid: runs
        .filter((r) => !(r.validity as { ok: boolean }).ok)
        .slice(0, 8)
        .map((r) => ({ ref: r.ref, reasons: (r.validity as { reasons: string[] }).reasons })),
    };
  };
  return {
    lab: { id: labId, title: ir.title },
    board: board
      ? { id: board.id, number: `B-${String(board.index + 1).padStart(2, '0')}`, title: board.title, subtitle: board.subtitle, views: board.viewKinds }
      : { id: boardId },
    otherBoards: ir.boards.filter((b) => b.id !== boardId).map((b) => ({ id: b.id, title: b.title })),
    parameters: (board?.paramKeys ?? [])
      .map((k) => ir.params.find((p) => p.key === k))
      .filter(Boolean)
      .map((p) => ({
        name: p!.name,
        urlKey: p!.urlKey,
        label: p!.label,
        binding: p!.binding,
        value: p!.key in applied ? applied[p!.key] : p!.defaultValue,
        options: p!.options?.slice(0, 12).map((o) => o.value),
      })),
    experiments: ir.experiments
      .filter((e) => !board || board.experiments.includes(e.id))
      .map((e) => ({ id: e.id, question: e.question, host: e.host, workload: e.workload, boundary: e.boundary, arms: e.arms.map((a) => ({ name: a.name, role: a.role, rev: a.rev })), runs: runsOf(e.id) })),
    derives: ir.nodes.filter((n) => n.kind === 'derive').map((n) => n.label),
    hypotheses: ir.hypotheses,
    plan: { execute: ir.plan.execute, import: ir.plan.import, cached: ir.plan.cached, blocked: ir.plan.blocked },
    pendingPlan: pending ? { changes: pending.changes.map((c) => `${c.urlKey}: ${String(c.from)} → ${String(c.to)}`), captures: pending.captures.length } : null,
    selection: s.selection.sel ?? null,
    lint: ir.lint.filter((l) => l.level !== 'info').slice(0, 10).map((l) => `${l.level} ${l.code}: ${l.message}`),
    server: s.server.status,
  };
}
