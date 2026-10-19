import { scaleBand, scaleLinear, scaleLog } from 'd3-scale';
import { line as d3line } from 'd3-shape';
import { useId, useMemo, useState } from 'react';
import { useBoard } from '@/app/board-context';
import { useResolved } from '@/app/useResolved';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { useWidth } from '@/hooks/useWidth';
import { isQuery } from '@/lang/query';
import { FIELD_UNITS, isEnt } from '@/lang/rows';
import { fmtBytes, fmtNumber, getPath } from '@/lang/util';
import { isValue, num, provOf } from '@/lang/values';
import { formatValue, seriesColor, tintOf } from '@/lib/format';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './ChartView.css';

type Row = Record<string, unknown>;
const SHAPES = ['circle', 'ring', 'square', 'cross', 'triangle'] as const;
const OUTCOME_SHAPE: Record<string, (typeof SHAPES)[number]> = { ok: 'circle', expired: 'ring', rejected: 'cross', failed: 'triangle', true: 'circle', false: 'cross' };
/** Approximate advance of a 9px mono tick character, and the angle used when category labels collide. */
const TICK_CHAR_PX = 5.6;
const TILT_RAD = Math.PI / 6;

/** A log axis ticks every 1–9 multiple; keep the 1·2·5 steps that sit at least 14 px apart. */
const thinLogTicks = (ticks: number[], y: (t: number) => number) =>
  ticks
    .filter((t) => /^[125]/.test(t.toExponential()))
    .reduce<number[]>((kept, t) => (kept.length && Math.abs(y(kept[kept.length - 1]) - y(t)) < 14 ? kept : [...kept, t]), []);

const TRACK_COLOR: Record<string, string> = {
  'graph.capture': 'var(--d2)',
  'graph.evict': 'var(--d5)',
  'graph.fallback': 'var(--d4)',
  'graph.hit': 'var(--faint)',
};

const Mark: React.FC<{ shape: string; x: number; y: number; color: string; r?: number; prov: string }> = ({ shape, x, y, color, r = 3.4, prov }) => {
  const dashed = prov === 'derived' ? '1.5 1' : undefined;
  switch (shape) {
    case 'ring':
      return <circle cx={x} cy={y} r={r} fill="var(--sheet)" stroke={color} strokeWidth={1.3} />;
    case 'square':
      return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={color} strokeDasharray={dashed} />;
    case 'cross':
      return <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} stroke={color} strokeWidth={1.4} />;
    case 'triangle':
      return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z`} fill={color} />;
    default:
      return <circle cx={x} cy={y} r={r} fill={color} stroke={dashed ? color : undefined} strokeDasharray={dashed} />;
  }
};

const fmtTick = (v: number, unit?: string) => (unit === 'B' ? fmtBytes(v) : fmtNumber(v, 3));

/** Byte axes tick on binary steps (…, 512 MiB, 1 GiB, 2 GiB, …) so labels stay round. */
function byteTicks(max: number): number[] {
  if (!(max > 0)) return [0];
  let step = 1;
  while (max / step > 6) step *= 2;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

export const ChartView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // pattern ids must be unique per chart: several charts share one document
  const uid = `c${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const input = view.args[0];
  const r = useResolved(
    (res) => {
      const opts = (o: unknown) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o as Row).map(([k, v]) => [k, res(v)])) : {}) as Row;
      const rows = res(input);
      const [xField, xo] = view.pa('x') ?? [];
      const [yField, yo] = view.pa('y') ?? [];
      const track = view.pa('track');
      return {
        rows: (Array.isArray(rows) ? rows : []) as Row[],
        mark: String(res(view.p('mark')) ?? 'point'),
        x: String(res(xField) ?? 'x'),
        xo: opts(xo),
        y: String(res(yField) ?? 'y'),
        yo: opts(yo),
        color: res(view.p('color')) as string | undefined,
        shape: res(view.p('shape')) as string | undefined,
        sort: res(view.p('sort')) as string | undefined,
        title: res(view.p('title')) as string | undefined,
        track: track ? ((res(track[0]) ?? []) as Row[]) : null,
        trackOpts: track ? opts(track[1]) : {},
      };
    },
    [view],
  );
  const describe = isQuery(input) ? input.describe() : undefined;
  const model = useMemo(() => {
    if (!r.value) return null;
    const v = r.value;
    let rows = v.rows;
    if (v.sort) {
      const desc = v.sort.startsWith('-');
      const key = desc ? v.sort.slice(1) : v.sort;
      rows = [...rows].sort((a, b) => ((num(getPath(a, key)) ?? -Infinity) - (num(getPath(b, key)) ?? -Infinity)) * (desc ? -1 : 1));
    }
    const yUnit = (v.yo.unit as string | undefined) ?? rows.map((row) => getPath(row, v.y)).find(isValue)?.unit ?? FIELD_UNITS[v.y.split('.').pop() ?? v.y];
    const xs = rows.map((row) => getPath(row, v.x));
    const xNumeric = v.mark !== 'bar' && xs.length > 0 && xs.every((x) => num(x) !== null);
    const ys = rows.map((row) => num(getPath(row, v.y)));
    const present = ys.filter((y): y is number => y !== null);
    const colors = v.color ? [...new Set(rows.map((row) => String(getPath(row, v.color!))))] : [];
    const shapes = v.shape ? [...new Set(rows.map((row) => String(getPath(row, v.shape!))))] : [];
    return { ...v, rows, yUnit, xs, xNumeric, ys, present, colors, shapes };
  }, [r.value]);

  if (r.error) return <Panel kind="chart" input={describe}><PanelError error={r.error} /></Panel>;
  if (!model) return null;
  const m = model;
  const categories = m.xNumeric ? [] : [...new Set(m.xs.map(String))];
  const tickText = (c: string) => (c.length > 18 ? `${c.slice(0, 17)}…` : c);
  // category labels wider than their band are set at an angle rather than overprinting each other
  const labelPx = Math.max(0, ...categories.map((c) => tickText(c).length)) * TICK_CHAR_PX;
  const tilt = categories.length > 1 && labelPx > (width - 72) / categories.length - 6;
  const tiltH = tilt ? Math.round(labelPx * Math.sin(TILT_RAD)) : 0;
  const H = Number(view.p('height') ?? 230) + tiltH;
  const trackH = m.track ? 36 : 0;
  const M = { l: 58, r: 14, t: 22, b: 36 + trackH + tiltH };
  const W = width;
  const iw = Math.max(40, W - M.l - M.r);
  const ih = Math.max(40, H - M.t - M.b);
  const log = m.yo.scale === 'log';
  const minPos = Math.min(...m.present.filter((y) => y > 0), Infinity);
  const yMax = m.present.length ? Math.max(...m.present) : 1;
  const yMin = m.present.length ? Math.min(...m.present) : 0;
  const yScale = log
    ? scaleLog().domain([Number.isFinite(minPos) ? minPos * 0.8 : 1, Math.max(yMax * 1.25, 1)]).range([ih, 0]).clamp(true)
    : scaleLinear().domain([Math.min(0, yMin), yMax === yMin ? yMax + 1 : yMax * 1.08]).nice().range([ih, 0]);
  const xNum = m.xNumeric ? m.xs.map((x) => num(x) as number) : [];
  const xLin = scaleLinear().domain(m.xNumeric ? [Math.min(...xNum), Math.max(...xNum) || 1] : [0, 1]).nice().range([0, iw]);
  const xBand = scaleBand<string>().domain(categories).range([0, iw]).padding(0.25);
  const colorOf = (row: Row) => (m.color ? seriesColor(String(getPath(row, m.color)), m.colors.indexOf(String(getPath(row, m.color)))) : 'var(--accent)');
  const shapeOf = (row: Row) => {
    if (!m.shape) return 'circle';
    const s = String(getPath(row, m.shape));
    return OUTCOME_SHAPE[s] ?? SHAPES[m.shapes.indexOf(s) % SHAPES.length];
  };
  const missingCount = m.ys.filter((y) => y === null).length;
  const yTicks = (
    m.yUnit === 'B' && !log
      ? byteTicks(yScale.domain()[1] as number)
      : log
        ? thinLogTicks((yScale as ReturnType<typeof scaleLog>).ticks(4), (t) => yScale(t) as number)
        : (yScale as ReturnType<typeof scaleLinear>).ticks(5)
  ) as number[];
  const xTicks = m.xNumeric ? xLin.ticks(Math.max(2, Math.floor(iw / 90))) : [];
  const xUnit = (m.xo.unit as string | undefined) ?? FIELD_UNITS[m.x];
  const pick = (i: number) => {
    const row = m.rows[i];
    ctx.fire(view, 'select', { row, entity: isEnt(row) ? row : undefined });
  };

  let marks: React.ReactNode = null;
  if (m.mark === 'bar') {
    const groups = m.color && m.colors.length > 1 ? m.colors : [''];
    const sub = scaleBand<string>().domain(groups).range([0, xBand.bandwidth()]).padding(0.08);
    marks = m.rows.map((row, i) => {
      const x = (xBand(String(m.xs[i])) ?? 0) + (groups.length > 1 ? (sub(String(getPath(row, m.color!))) ?? 0) : 0);
      const bw = groups.length > 1 ? sub.bandwidth() : xBand.bandwidth();
      const y = m.ys[i];
      const cell = getPath(row, m.y);
      const prov = provOf(cell, (row as { __prov?: string }).__prov === 'derived' ? 'derived' : 'observed');
      if (y === null) {
        return (
          <g key={i} className="chart__missing" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x} y={ih - 10} width={bw} height={10} fill={`url(#${uid}-hatch)`} stroke="var(--faint)" />
            <text x={x + bw / 2} y={ih - 14} textAnchor="middle" className="chart__na">—</text>
          </g>
        );
      }
      const y0 = yScale(log ? Math.max(minPos * 0.8, 1e-9) : Math.max(0, yScale.domain()[0]));
      const y1 = yScale(y);
      return (
        <rect
          key={i}
          x={x}
          y={Math.min(y0, y1)}
          width={bw}
          height={Math.max(1, Math.abs(y0 - y1))}
          fill={prov === 'derived' ? `url(#${uid}-stipple-${m.colors.indexOf(String(getPath(row, m.color ?? ''))) + 1})` : colorOf(row)}
          stroke={colorOf(row)}
          strokeWidth={prov === 'derived' ? 1 : 0}
          className={hover === i ? 'is-hover' : ''}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onClick={() => pick(i)}
        />
      );
    });
  } else if (m.mark === 'line') {
    const series = m.color ? m.colors : [''];
    marks = series.map((s, si) => {
      const pts = m.rows
        .map((row, i) => ({ row, x: m.xNumeric ? xLin(xNum[i]) : (xBand(String(m.xs[i])) ?? 0) + xBand.bandwidth() / 2, y: m.ys[i] }))
        .filter((p) => (!m.color || String(getPath(p.row, m.color)) === s) && p.y !== null)
        .sort((a, b) => a.x - b.x);
      const d = d3line<{ x: number; y: number | null }>()
        .x((p) => p.x)
        .y((p) => yScale(p.y as number))(pts);
      return <path key={s || si} d={d ?? ''} fill="none" stroke={seriesColor(s, si)} strokeWidth={1.4} />;
    });
  } else {
    marks = m.rows.map((row, i) => {
      const x = m.xNumeric ? xLin(xNum[i]) : (xBand(String(m.xs[i])) ?? 0) + xBand.bandwidth() / 2;
      const y = m.ys[i];
      if (y === null) return <text key={i} x={x} y={ih - 2} className="chart__na" textAnchor="middle">×</text>;
      return (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => pick(i)} className={`chart__pt${hover === i ? ' is-hover' : ''}`}>
          <Mark shape={shapeOf(row)} x={x} y={yScale(y)} color={colorOf(row)} prov={provOf(getPath(row, m.y), (row as { __prov?: string }).__prov === 'derived' ? 'derived' : 'observed')} r={m.rows.length > 400 ? 2.2 : 3.2} />
        </g>
      );
    });
  }

  const trackTypes = m.track ? [...new Set(m.track.map((t) => String(t.type)))] : [];
  const hovered = hover !== null ? m.rows[hover] : null;
  const caption = `${m.mark} chart of ${m.y} by ${m.x}${m.color ? `, coloured by ${m.color}` : ''}; ${m.rows.length} rows${missingCount ? `, ${missingCount} missing` : ''}`;

  return (
    <Panel
      kind="chart"
      input={describe}
      title={m.title}
      footer={
        <>
          {m.rows.length} rows{missingCount ? ` · ${missingCount} missing values drawn hatched (▨), excluded from scales` : ''}
          {m.rows.some((row) => provOf(getPath(row, m.y)) === 'derived' || (row as { __prov?: string }).__prov === 'derived') ? ' · ◐ derived values dithered' : ''}
          {m.trackOpts.label ? ` · track: ${String(m.trackOpts.label)}` : ''}
        </>
      }
    >
      {m.rows.length === 0 ? (
        <EmptyState title="No rows" hint="Nothing to plot for these parameters, or the capture has not been imported." />
      ) : (
        <div ref={wrap} className="chart">
          <div className="chart__legend">
            {m.colors.map((c, i) => (
              <span key={c}>
                <i style={{ background: seriesColor(c, i) }} />
                {c}
              </span>
            ))}
            {m.shape
              ? m.shapes.map((s) => (
                  <span key={`s-${s}`}>
                    <svg width={10} height={10} aria-hidden>
                      <Mark shape={OUTCOME_SHAPE[s] ?? SHAPES[m.shapes.indexOf(s) % SHAPES.length]} x={5} y={5} color="var(--muted)" r={3} prov="observed" />
                    </svg>
                    {m.shape} {s}
                  </span>
                ))
              : null}
            {trackTypes.map((t) => (
              <span key={`t-${t}`}>
                <i style={{ background: TRACK_COLOR[t] ?? 'var(--muted)', width: 2 }} />
                {t}
              </span>
            ))}
          </div>
          <svg width={W} height={H} role="img" aria-label={caption}>
            <defs>
              <pattern id={`${uid}-hatch`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke="var(--faint)" strokeWidth="1" />
              </pattern>
              {[0, ...m.colors.map((_, i) => i + 1)].map((i) => {
                const c = i === 0 ? 'var(--accent)' : seriesColor(m.colors[i - 1], i - 1);
                return (
                  <pattern key={i} id={`${uid}-stipple-${i}`} width="3.2" height="3.2" patternUnits="userSpaceOnUse">
                    <rect width="3.2" height="3.2" style={{ fill: tintOf(c) }} />
                    <circle cx="1.6" cy="1.6" r="0.75" style={{ fill: c }} />
                  </pattern>
                );
              })}
            </defs>
            <g transform={`translate(${M.l},${M.t})`}>
              {yTicks.map((t) => (
                <g key={t} transform={`translate(0,${yScale(t)})`}>
                  <line x2={iw} className="chart__grid" />
                  <text x={-6} dy="0.32em" textAnchor="end" className="chart__tick">
                    {fmtTick(t, m.yUnit)}
                  </text>
                </g>
              ))}
              <line y1={ih} y2={ih} x2={iw} className="chart__axis" />
              {m.xNumeric
                ? xTicks.map((t) => (
                    <text key={t} x={xLin(t)} y={ih + 14} textAnchor="middle" className="chart__tick">
                      {fmtNumber(t, 3)}
                    </text>
                  ))
                : categories.map((c) => {
                    const cx = (xBand(c) ?? 0) + xBand.bandwidth() / 2;
                    return tilt ? (
                      <text key={c} transform={`translate(${cx},${ih + 10}) rotate(${(-TILT_RAD * 180) / Math.PI})`} textAnchor="end" className="chart__tick">
                        <title>{c}</title>
                        {tickText(c)}
                      </text>
                    ) : (
                      <text key={c} x={cx} y={ih + 14} textAnchor="middle" className="chart__tick">
                        <title>{c}</title>
                        {tickText(c)}
                      </text>
                    );
                  })}
              <text x={iw} y={ih + 28 + tiltH} textAnchor="end" className="chart__axislabel">
                {String(m.xo.label ?? m.x)}
                {xUnit ? ` (${xUnit})` : ''}
              </text>
              <text x={-M.l + 2} y={-12} className="chart__axislabel">
                {m.y}
                {m.yUnit ? ` (${m.yUnit})` : ''}
                {log ? ' · log' : ''}
              </text>
              {marks}
              {m.track && m.xNumeric ? (
                <g transform={`translate(0,${ih + 52})`}>
                  <line x2={iw} className="chart__axis" />
                  {m.track.map((t, i) => {
                    const tx = num(t[m.x]) ?? num(t.t);
                    if (tx === null || tx < xLin.domain()[0] || tx > xLin.domain()[1]) return null;
                    return <line key={i} x1={xLin(tx)} x2={xLin(tx)} y1={-12} y2={0} stroke={TRACK_COLOR[String(t.type)] ?? 'var(--muted)'} strokeWidth={1.2}><title>{`${String(t.type)} · ${String(t.layout ?? '')} · t=${fmtNumber(tx, 4)} s`}</title></line>;
                  })}
                </g>
              ) : null}
            </g>
          </svg>
          {hovered ? (
            <div className="chart__tip" role="status">
              {[m.x, m.y, m.color, m.shape].filter(Boolean).map((k) => {
                const f = formatValue(getPath(hovered, k as string), k === m.y ? m.yUnit : FIELD_UNITS[k as string]);
                return (
                  <div key={k}>
                    <span className="muted">{k}</span> {f.text} {k === m.y ? <span className="muted">{f.prov}{f.missing ? ` · ${f.reason}` : ''}</span> : null}
                  </div>
                );
              })}
              {isEnt(hovered) ? <div className="muted">{hovered.ref.split('!').pop()} · click to select</div> : null}
            </div>
          ) : null}
          <details className="chart__data">
            <summary>Data table</summary>
            <table>
              <thead>
                <tr>
                  {[m.x, m.y, m.color, m.shape].filter(Boolean).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.rows.slice(0, 40).map((row, i) => (
                  <tr key={i}>
                    {[m.x, m.y, m.color, m.shape].filter(Boolean).map((k) => (
                      <td key={k}>{formatValue(getPath(row, k as string), k === m.y ? m.yUnit : undefined).text}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </Panel>
  );
};
