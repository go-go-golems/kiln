import { scaleLinear } from 'd3-scale';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBoard } from '@/app/board-context';
import { useAppSelector } from '@/app/hooks';
import { useResolved } from '@/app/useResolved';
import { IconButton } from '@/components/atoms/IconButton';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { useWidth } from '@/hooks/useWidth';
import { isEnt, type Ent } from '@/lang/rows';
import { fmtNumber } from '@/lang/util';
import { runFor } from '../ManifestView';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './TimelineView.css';

const LANE_H = 18;
const LABEL_W = 104;
const RULER_H = 22;

/** Kernel fill by role: the operation under study in the accent family, other families in subtle hues, the rest neutral. */
const ROLE_FILL: { re: RegExp; label: string; fill: string }[] = [
  { re: /^encoder\.sampling$/, label: 'sampling', fill: 'var(--d1)' },
  { re: /^encoder\.reduce$/, label: 'reduce', fill: 'var(--d4)' },
  { re: /norm$|^rmsnorm$/, label: 'norm', fill: 'var(--d3)' },
  { re: /softmax|^attention$/, label: 'attention', fill: 'var(--d6)' },
  { re: /transfer/, label: 'copy', fill: 'var(--d2)' },
];
const roleOf = (k: Ent) => ROLE_FILL.find(({ re }) => re.test(String(k.role ?? ''))) ?? (String(k.lane).includes('copy') ? ROLE_FILL[4] : null);
export const kernelFill = (k: Ent) => roleOf(k)?.fill ?? 'var(--hair)';

/** Names every colour a set of kernels uses, so a hue is never the only way to tell roles apart. */
export const RoleLegend: React.FC<{ kernels: Ent[] }> = ({ kernels }) => {
  const used = ROLE_FILL.filter((r) => kernels.some((k) => roleOf(k) === r));
  if (!used.length) return null;
  return (
    <ul className="tl__legend" aria-label="Kernel roles">
      {used.map((r) => (
        <li key={r.label}>
          <span className="tl__swatch" style={{ background: r.fill }} aria-hidden />
          {r.label}
        </li>
      ))}
      <li>
        <span className="tl__swatch" style={{ background: 'var(--hair)' }} aria-hidden />
        other
      </li>
    </ul>
  );
};

interface Item {
  ent: Ent;
  lane: string;
  start: number;
  end: number;
}

/**
 * One run on its own clock. Concurrency is preserved: every lane draws its own events, and zooming out
 * merges sub-pixel events into buckets that keep their count and their longest member.
 */
export const TimelineView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const sel = useAppSelector((s) => s.selection.sel);
  const [wrap, width] = useWidth<HTMLDivElement>();
  const r = useResolved(
    (res) => ({
      run: runFor(ctx.reg, res(view.args[0])),
      lanes: ((view.pa('lanes') ?? []).map((x) => res(x)).flat() as string[]) ?? [],
      win: res(view.p('window')) as [number, number] | undefined,
      focus: res(view.p('focus')),
    }),
    [view, ctx.reg],
  );
  const run = r.value?.run ?? null;
  const data = useMemo(() => {
    if (!run) return null;
    const src = ctx.reg.source;
    const items: Item[] = [];
    for (const kind of ['span', 'kernel'] as const) {
      for (const e of src.entities(kind, run.ref)) {
        const s = Number(e.start);
        const en = Number(e.end);
        if (Number.isFinite(s) && Number.isFinite(en)) items.push({ ent: e, lane: String(e.lane), start: s, end: Math.max(en, s + 1) });
      }
    }
    const requests = src.entities('request', run.ref).filter((q) => Number.isFinite(Number(q.start)) && Number.isFinite(Number(q.end)));
    for (const q of requests) items.push({ ent: q, lane: 'requests', start: Number(q.start), end: Number(q.end) });
    const found = [...new Set(items.map((i) => i.lane))];
    const preferred = r.value?.lanes ?? [];
    const lanes = ['requests', ...preferred.filter((l) => found.includes(l)), ...found.filter((l) => l !== 'requests' && !preferred.includes(l))].filter((l) => found.includes(l));
    const byLane = new Map<string, Item[]>(lanes.map((l) => [l, items.filter((i) => i.lane === l).sort((a, b) => a.start - b.start)]));
    const t0 = items.length ? Math.min(...items.map((i) => i.start)) : 0;
    const t1 = items.length ? Math.max(...items.map((i) => i.end)) : 1;
    const lost = ((run.coverage as { trace: { lost: { from: number; to: number; reason: string }[] } }).trace.lost ?? []).map((g) => ({ from: g.from * 1e9, to: g.to * 1e9, reason: g.reason }));
    const kernels = items.filter((i) => i.ent.kind === 'kernel').map((i) => i.ent);
    return { lanes, byLane, t0, t1, lost, kernels, count: items.length };
  }, [run, ctx.reg, r.value?.lanes]);

  const initial = (): [number, number] => {
    if (!data) return [0, 1];
    const w = r.value?.win;
    return w ? [w[0] * 1e9, w[1] * 1e9] : [data.t0, data.t1];
  };
  const [domain, setDomain] = useState<[number, number]>(initial);
  const runRef = run?.ref;
  useEffect(() => setDomain(initial()), [runRef, data?.t0, data?.t1]);

  const focus = r.value?.focus;
  const focusRef = isEnt(focus) ? focus.ref : null;
  useEffect(() => {
    if (!isEnt(focus) || String(focus.run) !== runRef) return;
    const s = Number(focus.start);
    const e = Number(focus.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return;
    if (focus.kind === 'request') {
      const pad = (e - s) * 0.04;
      setDomain([s - pad, e + pad]);
    } else {
      setDomain(([a, b]) => {
        const span = Math.max(Math.min(b - a, (e - s) * 40), (e - s) * 6);
        const c = (s + e) / 2;
        return [c - span / 2, c + span / 2];
      });
    }
  }, [focusRef, runRef]);

  const drag = useRef<{ x: number; d: [number, number] } | null>(null);
  if (r.error) return <Panel kind="timeline"><PanelError error={r.error} /></Panel>;
  if (!run || !data) {
    return (
      <Panel kind="timeline" input={typeof view.args[0] === 'string' ? view.args[0] : undefined}>
        <EmptyState title="Run not imported" hint="Pick an imported run, or execute the pending plan." />
      </Panel>
    );
  }
  if (data.count === 0) {
    return (
      <Panel kind="timeline" input={run.ref}>
        <EmptyState title="No trace events in this run" hint={`${run.ref} is a ${String(run.mode)} capture; timelines need a trace capture.`} />
      </Panel>
    );
  }
  const [a, b] = domain;
  const iw = Math.max(80, width - LABEL_W - 8);
  const x = scaleLinear().domain([a, b]).range([0, iw]);
  const H = RULER_H + data.lanes.length * (LANE_H + 3) + 6;
  const zoom = (f: number, at = 0.5) => {
    const c = a + (b - a) * at;
    const nw = Math.max(2e3, Math.min((data.t1 - data.t0) * 1.5, (b - a) * f));
    setDomain([c - nw * at, c + nw * (1 - at)]);
  };
  const pan = (f: number) => setDomain([a + (b - a) * f, b + (b - a) * f]);
  const msTicks = scaleLinear().domain([(a - data.t0) / 1e6, (b - data.t0) / 1e6]).ticks(Math.max(2, Math.floor(iw / 110)));
  const windowMs = (b - a) / 1e6;
  const unitSeconds = windowMs > 5000;

  const laneRows = data.lanes.map((lane, li) => {
    const y = RULER_H + li * (LANE_H + 3);
    const out: React.ReactNode[] = [];
    let bucket: { px: number; n: number; max: Item } | null = null;
    const flush = () => {
      if (!bucket) return;
      const it = bucket.max;
      out.push(
        <rect key={`b-${it.ent.ref}`} x={bucket.px} y={y + 2} width={2} height={LANE_H - 4} className="tl__bucket" onClick={() => ctx.fire(view, 'select', { entity: it.ent, row: it.ent })}>
          <title>{`${bucket.n} events merged · longest ${String(it.ent.name ?? it.ent.id)} ${fmtNumber((it.end - it.start) / 1e6, 3)} ms`}</title>
        </rect>,
      );
      bucket = null;
    };
    for (const it of data.byLane.get(lane) ?? []) {
      if (it.end < a || it.start > b) continue;
      const x0 = x(it.start);
      const x1 = x(it.end);
      const w = x1 - x0;
      if (w < 1.5) {
        const px = Math.floor(x0 / 2) * 2;
        if (bucket && bucket.px === px) {
          bucket.n++;
          if (it.end - it.start > bucket.max.end - bucket.max.start) bucket.max = it;
        } else {
          flush();
          bucket = { px, n: 1, max: it };
        }
        continue;
      }
      flush();
      const isSel = it.ent.ref === sel;
      const isFocus = it.ent.ref === focusRef;
      const isReq = it.ent.kind === 'request';
      const fill = isReq ? (it.ent.outcome === 'ok' ? 'var(--sheet)' : 'var(--bad-w)') : it.ent.kind === 'span' ? 'var(--sheet)' : kernelFill(it.ent);
      out.push(
        <g key={it.ent.ref} className={`tl__item${isSel ? ' is-sel' : ''}${isFocus ? ' is-focus' : ''}`} onClick={() => ctx.fire(view, 'select', { entity: it.ent, row: it.ent })}>
          <rect x={Math.max(-2, x0)} y={y + 2} width={Math.max(1.5, Math.min(iw + 2, x1) - Math.max(-2, x0))} height={LANE_H - 4} fill={fill} />
          {w > 44 ? (
            <text x={Math.max(2, x0 + 3)} y={y + LANE_H - 6} className="tl__label">
              {String(it.ent.name ?? it.ent.id).slice(0, Math.floor(w / 6))}
            </text>
          ) : null}
          <title>{`${String(it.ent.name ?? it.ent.id)} · ${fmtNumber((it.end - it.start) / 1e6, 4)} ms · ${lane}${it.ent.role ? ` · ${String(it.ent.role)}` : ''}`}</title>
        </g>,
      );
    }
    flush();
    return (
      <g key={lane}>
        <text x={-8} y={y + LANE_H - 6} textAnchor="end" className="tl__lane">
          {lane}
        </text>
        <line x1={0} x2={iw} y1={y + LANE_H + 1} y2={y + LANE_H + 1} className="tl__laneRule" />
        {out}
      </g>
    );
  });

  return (
    <Panel
      kind="timeline"
      input={run.ref}
      footer={
        <>
          clock: {String(run.clock)} · window {unitSeconds ? `${fmtNumber(windowMs / 1000, 3)} s` : `${fmtNumber(windowMs, 3)} ms`} · ctrl/⌘ + wheel zooms, drag pans, keys + − ← → 0
          {data.lost.length ? ` · ▨ ${data.lost.length} lost interval${data.lost.length > 1 ? 's' : ''}: no events exist there, not zero activity` : ''}
        </>
      }
      actions={
        <>
          <IconButton size="sm" icon="minus" label="Zoom out" onClick={() => zoom(2)} />
          <IconButton size="sm" icon="plus" label="Zoom in" onClick={() => zoom(0.5)} />
          <IconButton size="sm" icon="reset" label="Show the whole run" onClick={() => setDomain([data.t0, data.t1])} />
        </>
      }
      flush
    >
      <div
        ref={wrap}
        className="tl"
        tabIndex={0}
        role="application"
        aria-label={`Timeline of ${run.ref}; plus and minus zoom, arrow keys pan, 0 resets`}
        onKeyDown={(e) => {
          if (e.key === '+' || e.key === '=') zoom(0.5);
          else if (e.key === '-') zoom(2);
          else if (e.key === 'ArrowLeft') pan(-0.2);
          else if (e.key === 'ArrowRight') pan(0.2);
          else if (e.key === '0') setDomain([data.t0, data.t1]);
          else return;
          e.preventDefault();
        }}
        onWheel={(e) => {
          if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const at = Math.min(1, Math.max(0, (e.clientX - rect.left - LABEL_W) / iw));
          if (e.shiftKey) pan(e.deltaY > 0 ? 0.1 : -0.1);
          else zoom(e.deltaY > 0 ? 1.25 : 0.8, at);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('.tl__item, .tl__bucket')) return;
          drag.current = { x: e.clientX, d: domain };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const [da, db] = drag.current.d;
          const shift = (-dx / iw) * (db - da);
          setDomain([da + shift, db + shift]);
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <svg width={width} height={H} role="img" aria-label={`${data.lanes.length} lanes, ${data.count} events`}>
          <defs>
            <pattern id="tl-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--faint)" strokeWidth="1.2" />
            </pattern>
          </defs>
          <g transform={`translate(${LABEL_W},0)`}>
            {msTicks.map((t) => {
              const px = x(data.t0 + t * 1e6);
              return (
                <g key={t}>
                  <line x1={px} x2={px} y1={RULER_H - 6} y2={H} className="tl__tick" />
                  <text x={px + 2} y={RULER_H - 9} className="tl__tickText">
                    {unitSeconds ? `${fmtNumber(t / 1000, 4)} s` : `${fmtNumber(t, 4)} ms`}
                  </text>
                </g>
              );
            })}
            {data.lost.map((g, i) =>
              g.to < a || g.from > b ? null : (
                <g key={i}>
                  <rect x={Math.max(0, x(g.from))} y={RULER_H} width={Math.max(2, Math.min(iw, x(g.to)) - Math.max(0, x(g.from)))} height={H - RULER_H} fill="url(#tl-hatch)" className="tl__lost" />
                  <text x={Math.max(2, x(g.from) + 4)} y={RULER_H + 11} className="tl__lostText">
                    TRACE LOST · {g.reason}
                  </text>
                </g>
              ),
            )}
            {laneRows}
          </g>
        </svg>
      </div>
      <RoleLegend kernels={data.kernels} />
    </Panel>
  );
};
