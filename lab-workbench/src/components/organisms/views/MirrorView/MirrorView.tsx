import { useMemo } from 'react';
import { useBoard } from '@/app/board-context';
import { useAppSelector } from '@/app/hooks';
import { useResolved } from '@/app/useResolved';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { useWidth } from '@/hooks/useWidth';
import type { CompareResult } from '@/lang/compare';
import type { Ent } from '@/lang/rows';
import { fmtNumber } from '@/lang/util';
import { kernelFill, RoleLegend } from '../TimelineView';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './MirrorView.css';

const LANES = ['cpu:main', 'cpu:worker', 'cuda:stream 7', 'cuda:stream 3', 'cuda:copy'];
const LH = 16;

interface Side {
  run: Ent;
  req: Ent;
  items: Ent[];
  lanes: string[];
  t0: number;
  dur: number;
}

/** Two executions on two clocks, joined by structural correspondence — never drawn as one timeline. */
export const MirrorView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const sel = useAppSelector((s) => s.selection.sel);
  const [wrap, width] = useWidth<HTMLDivElement>();
  const r = useResolved((res) => ({ cmp: res(view.args[0]) as CompareResult, index: Number(res(view.p('request')) ?? 0) }), [view]);
  const sides = useMemo(() => {
    const c = r.value?.cmp;
    if (!c?.leftRun || !c?.rightRun) return null;
    const side = (ref: string): Side | null => {
      const run = ctx.reg.source.entity(ref);
      if (!run) return null;
      const reqs = ctx.reg.source.entities('request', ref).filter((q) => Number.isFinite(Number(q.start))).sort((a, b) => Number(a.start) - Number(b.start));
      if (!reqs.length) return null;
      const req = reqs[Math.min(Math.max(0, r.value!.index), reqs.length - 1)];
      const items = [...ctx.reg.source.entities('span', ref), ...ctx.reg.source.entities('kernel', ref)].filter((e) => e.request === req.id);
      const lanes = LANES.filter((l) => items.some((i) => i.lane === l));
      return { run, req, items, lanes, t0: Number(req.start), dur: Number(req.end) - Number(req.start) };
    };
    const left = side(c.leftRun);
    const right = side(c.rightRun);
    return left && right ? { left, right } : null;
  }, [r.value, ctx.reg]);
  if (r.error) return <Panel kind="mirror"><PanelError error={r.error} /></Panel>;
  const c = r.value?.cmp;
  if (c?.excluded?.length) {
    return (
      <Panel kind="mirror" stamp="EXCLUDED">
        <div className="panel-error" role="alert">
          Not comparable: {c.excluded.map((x) => `${x.field} (${String(x.left)} ≠ ${String(x.right)})`).join(', ')}
        </div>
      </Panel>
    );
  }
  if (!sides) return <Panel kind="mirror"><EmptyState title="Both traces must be imported" /></Panel>;
  const iw = Math.max(120, width - 108);
  const scale = iw / Math.max(sides.left.dur, sides.right.dur);
  const pairedOps = new Set(c!.pairs.map((p) => p.key));
  const leftOnly = new Set(c!.unmatched.left.map((u) => u.key));
  const rightOnly = new Set(c!.unmatched.right.map((u) => u.key));
  const unmatchedShown = String(view.p('unmatched') ?? 'show') === 'show';
  const panelH = (s: Side) => 34 + s.lanes.length * (LH + 3);
  const gap = 46;
  const H = panelH(sides.left) + gap + panelH(sides.right);
  const pos = (s: Side, e: Ent, top: number) => {
    const li = s.lanes.indexOf(String(e.lane));
    return { x: (Number(e.start) - s.t0) * scale, w: Math.max(1, (Number(e.end) - Number(e.start)) * scale), y: top + 26 + li * (LH + 3) };
  };
  const occurrences = (s: Side) => {
    const m = new Map<string, Ent[]>();
    for (const k of s.items.filter((e) => e.kind === 'kernel').sort((a, b) => Number(a.start) - Number(b.start))) {
      const key = String(k.op ?? k.name);
      m.set(key, [...(m.get(key) ?? []), k]);
    }
    return m;
  };
  const lo = occurrences(sides.left);
  const ro = occurrences(sides.right);
  const connectors: React.ReactNode[] = [];
  const rightTop = panelH(sides.left) + gap;
  for (const [op, ls] of lo) {
    if (!pairedOps.has(op)) continue;
    const rs = ro.get(op) ?? [];
    const n = Math.min(ls.length, rs.length);
    for (let i = 0; i < n && connectors.length < 90; i += Math.max(1, Math.floor(n / 8))) {
      const a = pos(sides.left, ls[i], 0);
      const b = pos(sides.right, rs[i], rightTop);
      connectors.push(<line key={`${op}-${i}`} x1={a.x + a.w / 2} y1={a.y + LH} x2={b.x + b.w / 2} y2={b.y} className="mirror__link" />);
    }
  }
  const drawSide = (s: Side, top: number, onlySet: Set<string>, label: string) => (
    <g transform={`translate(0,${top})`}>
      <text x={-100} y={12} className="mirror__run">
        {label}
      </text>
      <text x={0} y={12} className="mirror__meta">
        {s.run.ref} · {s.req.id} · {fmtNumber(s.dur / 1e6, 4)} ms on its own clock
      </text>
      {s.lanes.map((l, li) => (
        <text key={l} x={-8} y={26 + li * (LH + 3) + LH - 4} textAnchor="end" className="mirror__lane">
          {l}
        </text>
      ))}
      {s.items.map((e) => {
        const p = pos(s, e, 0);
        const unmatched = e.kind === 'kernel' && onlySet.has(String(e.op ?? e.name));
        if (unmatched && !unmatchedShown) return null;
        return (
          <rect
            key={e.ref}
            x={p.x}
            y={p.y}
            width={p.w}
            height={LH}
            className={`mirror__item${e.ref === sel ? ' is-sel' : ''}${unmatched ? ' is-unmatched' : ''}`}
            fill={e.kind === 'span' ? 'var(--sheet)' : kernelFill(e)}
            onClick={() => ctx.fire(view, 'select', { entity: e, row: e })}
          >
            <title>{`${String(e.name)} · ${fmtNumber(Number(e.dur), 3)} ms${unmatched ? ' · no counterpart in the other run' : ''}`}</title>
          </rect>
        );
      })}
    </g>
  );
  return (
    <Panel
      kind="mirror"
      input={`${c!.leftRun} ↔ ${c!.rightRun}`}
      stamp="STRUCTURAL MATCH — SEPARATE CLOCKS"
      footer={`${c!.pairs.length} operations matched by ${'op'} · ${c!.unmatched.left.length} only in baseline · ${c!.unmatched.right.length} only in candidate · dashed outline = no counterpart · both rows share one px/ms scale, not one clock`}
      flush
    >
      <div ref={wrap} className="mirror">
        <svg width={width} height={H + 4} role="img" aria-label={`Request ${sides.left.req.id} in two runs, joined by corresponding operations`}>
          <g transform="translate(104,2)">
            {drawSide(sides.left, 0, leftOnly, 'BASELINE')}
            {connectors}
            {drawSide(sides.right, rightTop, rightOnly, 'CANDIDATE')}
          </g>
        </svg>
      </div>
      <RoleLegend kernels={[...sides.left.items, ...sides.right.items].filter((e) => e.kind === 'kernel')} />
    </Panel>
  );
};
