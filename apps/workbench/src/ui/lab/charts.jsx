// The board's two drawn panels (guide §33), ported from Perf Lab's ChartView and TimelineView without d3 and in
// Kiln's monochrome: a series is told apart by fill, shape and dash, never by hue; red marks only the selected
// mark. A missing value is drawn as a hatched stub labelled "—" and kept out of the scales; a derived value is
// stippled. Both panels carry a data table or a title on every mark, so no reading depends on the picture alone.
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cls } from "../common.jsx";
import { Panel, PanelError, useBoard, useResolved } from "./board.jsx";
import { runFor } from "./panels.jsx";
import { formatValue } from "./format.js";
import { isEnt, isQuery, isValue, getPath, num, provOf, fmtBytes, fmtNumber, FIELD_UNITS } from "./api.js";

/** [ref, width] of an element, following its size. */
function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ----------------------------------------------------------------------------- scales

const STEPS = [1, 2, 5, 10];
/** Round tick values covering [lo, hi], about `n` of them (d3's 1·2·5 rule). */
export function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / Math.max(1, n), mag = 10 ** Math.floor(Math.log10(raw));
  const step = mag * STEPS.find((s) => s * mag >= raw);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
/** The domain widened to whole ticks, as d3's `.nice()`. */
const niceDomain = (lo, hi, n = 5) => {
  const t = niceTicks(lo, hi, n);
  if (t.length < 2) return [lo, hi];
  const step = t[1] - t[0];
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
};
const linear = ([d0, d1], [r0, r1]) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
const logScale = ([d0, d1], [r0, r1]) => (v) => r0 + ((Math.log10(Math.min(Math.max(v, d0), d1)) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0) || 1)) * (r1 - r0);
/** 1·2·5 multiples of each decade inside the domain, kept only where they sit at least 14 px apart. */
function logTicks([d0, d1], y) {
  const out = [];
  for (let e = Math.floor(Math.log10(d0)); e <= Math.ceil(Math.log10(d1)); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= d0 && v <= d1) out.push(v); }
  return out.reduce((kept, t) => (kept.length && Math.abs(y(kept.at(-1)) - y(t)) < 14 ? kept : [...kept, t]), []);
}
/** Categories over [0, width]: { at(c), bw }, with `pad` of a step between bands and half of it at the ends. */
function band(cats, width, pad = 0.25) {
  const step = width / Math.max(1, cats.length + pad);
  const bw = step * (1 - pad), off = step * pad;
  const idx = new Map(cats.map((c, i) => [c, i]));
  return { at: (c) => off + (idx.get(c) ?? 0) * step, bw, step };
}
/** Byte axes tick on binary steps (…, 512 MiB, 1 GiB, 2 GiB, …) so labels stay round. */
function byteTicks(max) {
  if (!(max > 0)) return [0];
  let step = 1;
  while (max / step > 6) step *= 2;
  const out = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}
const fmtTick = (v, unit) => (unit === "B" ? fmtBytes(v) : fmtNumber(v, 3));

// ----------------------------------------------------------------------------- series marks

// A series is an index into these: point shapes, bar fills and line dashes, all in ink.
const SHAPES = ["circle", "ring", "square", "cross", "triangle", "diamond"];
const OUTCOME_SHAPE = { ok: "circle", expired: "ring", rejected: "cross", failed: "triangle", true: "circle", false: "cross" };
const DASH = [undefined, "5 3", "1.5 2.5", "8 3 2 3", "3 3"];
const FILLS = ["solid", "hollow", "hatch", "grey", "dots"];

function Mark({ shape, x, y, r = 3.4, sel, derived }) {
  const ink = sel ? "var(--accent)" : "var(--ink)";
  const fill = derived ? "var(--bg)" : ink;
  switch (shape) {
    case "ring": return <circle cx={x} cy={y} r={r} fill="var(--bg)" stroke={ink} strokeWidth={1.3} />;
    case "square": return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={fill} stroke={ink} strokeWidth={derived ? 1.2 : 0} />;
    case "cross": return <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} stroke={ink} strokeWidth={1.5} />;
    case "triangle": return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z`} fill={fill} stroke={ink} strokeWidth={derived ? 1.2 : 0} />;
    case "diamond": return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z`} fill="var(--bg)" stroke={ink} strokeWidth={1.3} />;
    default: return <circle cx={x} cy={y} r={r} fill={fill} stroke={ink} strokeWidth={derived ? 1.2 : 0} strokeDasharray={derived ? "1.5 1" : undefined} />;
  }
}

/** A bar's fill for series `i`: solid ink, hollow, hatched, grey, dotted; derived bars are stippled. */
const barFill = (uid, i, derived) => (derived ? `url(#${uid}-stipple)` : { solid: "var(--ink)", hollow: "var(--bg)", hatch: `url(#${uid}-hatch)`, grey: "var(--ink-3)", dots: `url(#${uid}-dots)` }[FILLS[i % FILLS.length]]);

function Swatch({ uid, i, kind, shape }) {
  if (kind === "line") return <svg width={18} height={10} aria-hidden="true"><line x1={1} x2={17} y1={5} y2={5} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray={DASH[i % DASH.length]} /></svg>;
  if (kind === "point") return <svg width={10} height={10} aria-hidden="true"><Mark shape={shape} x={5} y={5} r={3} /></svg>;
  return <svg width={10} height={10} aria-hidden="true"><rect x={0.5} y={0.5} width={9} height={9} fill={barFill(uid, i, false)} stroke="var(--ink)" strokeWidth={1} /></svg>;
}

function Patterns({ uid }) {
  return (
    <defs>
      <pattern id={`${uid}-hatch`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="var(--bg)" /><line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink)" strokeWidth="1.2" /></pattern>
      <pattern id={`${uid}-miss`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink-3)" strokeWidth="1" /></pattern>
      <pattern id={`${uid}-dots`} width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="var(--bg)" /><circle cx="2" cy="2" r="1" fill="var(--ink)" /></pattern>
      <pattern id={`${uid}-stipple`} width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="var(--bg)" /><circle cx="1.5" cy="1.5" r="0.7" fill="var(--ink-2)" /></pattern>
    </defs>
  );
}

// ----------------------------------------------------------------------------- chart

const TICK_CHAR_PX = 5.6, TILT_RAD = Math.PI / 6;

export function ChartView({ view }) {
  const ctx = useBoard();
  const [wrap, width] = useWidth();
  const [hover, setHover] = useState(null);
  const uid = `lc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const input = view.args[0];
  const r = useResolved((res) => {
    const opts = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, res(v)])) : {});
    const rows = res(input);
    const [xField, xo] = view.pa("x") ?? [], [yField, yo] = view.pa("y") ?? [];
    return {
      rows: Array.isArray(rows) ? rows : [], mark: String(res(view.p("mark")) ?? "point"),
      x: String(res(xField) ?? "x"), xo: opts(xo), y: String(res(yField) ?? "y"), yo: opts(yo),
      color: res(view.p("color")), shape: res(view.p("shape")), sort: res(view.p("sort")), title: res(view.p("title")),
    };
  }, [view]);
  const describe = isQuery(input) ? input.describe() : undefined;
  const m = useMemo(() => {
    if (!r.value) return null;
    const v = r.value;
    let rows = v.rows;
    if (v.sort) {
      const desc = v.sort.startsWith("-"), key = desc ? v.sort.slice(1) : v.sort;
      rows = [...rows].sort((a, b) => ((num(getPath(a, key)) ?? -Infinity) - (num(getPath(b, key)) ?? -Infinity)) * (desc ? -1 : 1));
    }
    const yUnit = v.yo.unit ?? rows.map((row) => getPath(row, v.y)).find(isValue)?.unit ?? FIELD_UNITS[v.y.split(".").pop()];
    const xs = rows.map((row) => getPath(row, v.x));
    const xNumeric = v.mark !== "bar" && xs.length > 0 && xs.every((x) => num(x) !== null);
    const ys = rows.map((row) => num(getPath(row, v.y)));
    const series = v.color ? [...new Set(rows.map((row) => String(getPath(row, v.color))))] : [];
    const shapes = v.shape ? [...new Set(rows.map((row) => String(getPath(row, v.shape))))] : [];
    return { ...v, rows, yUnit, xs, xNumeric, ys, present: ys.filter((y) => y !== null), series, shapes };
  }, [r.value]);

  if (r.error) return <Panel kind="chart" input={describe}><PanelError error={r.error} /></Panel>;
  if (!m) return null;
  if (!m.rows.length) return <Panel kind="chart" input={describe} title={m.title}><div className="lab-empty"><b>No rows</b><span>Nothing to plot for these parameters, or the capture has not been imported.</span></div></Panel>;

  const seriesOf = (row) => (m.color ? m.series.indexOf(String(getPath(row, m.color))) : 0);
  const shapeOf = (row) => {
    if (m.shape) { const s = String(getPath(row, m.shape)); return OUTCOME_SHAPE[s] ?? SHAPES[m.shapes.indexOf(s) % SHAPES.length]; }
    return m.color ? SHAPES[seriesOf(row) % SHAPES.length] : "circle";
  };
  const derivedOf = (row) => provOf(getPath(row, m.y), row.__prov === "derived" ? "derived" : "observed") === "derived";
  const categories = m.xNumeric ? [] : [...new Set(m.xs.map(String))];
  const tickText = (c) => (c.length > 18 ? `${c.slice(0, 17)}…` : c);
  const labelPx = Math.max(0, ...categories.map((c) => tickText(c).length)) * TICK_CHAR_PX;
  const tilt = categories.length > 1 && labelPx > (width - 72) / categories.length - 6;
  const tiltH = tilt ? Math.round(labelPx * Math.sin(TILT_RAD)) : 0;
  const H = Number(view.p("height") ?? 230) + tiltH;
  const M = { l: 58, r: 14, t: 22, b: 36 + tiltH };
  const W = width, iw = Math.max(40, W - M.l - M.r), ih = Math.max(40, H - M.t - M.b);

  const log = m.yo.scale === "log";
  const yMax = m.present.length ? Math.max(...m.present) : 1, yMin = m.present.length ? Math.min(...m.present) : 0;
  const minPos = Math.min(...m.present.filter((y) => y > 0), Infinity);
  const yDomain = log ? [Number.isFinite(minPos) ? minPos * 0.8 : 1, Math.max(yMax * 1.25, 1)] : niceDomain(Math.min(0, yMin), yMax === yMin ? yMax + 1 : yMax * 1.08);
  const y = (log ? logScale : linear)(yDomain, [ih, 0]);
  const yTicks = m.yUnit === "B" && !log ? byteTicks(yDomain[1]) : log ? logTicks(yDomain, y) : niceTicks(yDomain[0], yDomain[1], 5);
  const xNum = m.xNumeric ? m.xs.map((x) => num(x)) : [];
  const xDomain = m.xNumeric ? niceDomain(Math.min(...xNum), Math.max(...xNum) || 1, Math.max(2, Math.floor(iw / 90))) : [0, 1];
  const xLin = linear(xDomain, [0, iw]);
  const xBand = band(categories, iw);
  const xTicks = m.xNumeric ? niceTicks(xDomain[0], xDomain[1], Math.max(2, Math.floor(iw / 90))) : [];
  const xUnit = m.xo.unit ?? FIELD_UNITS[m.x];
  const missingCount = m.ys.filter((v) => v === null).length;
  const selected = (row) => isEnt(row) && ctx.selected === row.ref;
  const pick = (i) => ctx.fire(view, "select", { row: m.rows[i], entity: isEnt(m.rows[i]) ? m.rows[i] : undefined });
  const hoverProps = (i) => ({ onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null), onClick: () => pick(i) });

  let marks;
  if (m.mark === "bar") {
    const groups = m.color && m.series.length > 1 ? m.series : [""];
    const sub = band(groups, xBand.bw, 0.08);
    const base = y(log ? yDomain[0] : Math.max(0, yDomain[0]));
    marks = m.rows.map((row, i) => {
      const x = xBand.at(String(m.xs[i])) + (groups.length > 1 ? sub.at(String(getPath(row, m.color))) : 0);
      const bw = groups.length > 1 ? sub.bw : xBand.bw, v = m.ys[i];
      if (v === null) return <g key={i} className="lc-miss" {...hoverProps(i)}><rect x={x} y={ih - 10} width={bw} height={10} fill={`url(#${uid}-miss)`} stroke="var(--ink-3)" /><text x={x + bw / 2} y={ih - 14} textAnchor="middle" className="lc-na">—</text></g>;
      const top = y(v);
      return <rect key={i} x={x} y={Math.min(base, top)} width={bw} height={Math.max(1, Math.abs(base - top))} fill={barFill(uid, seriesOf(row), derivedOf(row))} stroke={selected(row) || hover === i ? "var(--accent)" : "var(--ink)"} strokeWidth={selected(row) ? 2 : 1} className="lc-bar" {...hoverProps(i)} />;
    });
  } else if (m.mark === "line") {
    marks = (m.color ? m.series : [""]).map((s, si) => {
      const pts = m.rows.map((row, i) => ({ row, x: m.xNumeric ? xLin(xNum[i]) : xBand.at(String(m.xs[i])) + xBand.bw / 2, y: m.ys[i] }))
        .filter((p) => (!m.color || String(getPath(p.row, m.color)) === s) && p.y !== null).sort((a, b) => a.x - b.x);
      return <path key={s || si} d={pts.map((p, i) => `${i ? "L" : "M"}${p.x},${y(p.y)}`).join("")} fill="none" stroke="var(--ink)" strokeWidth={1.4} strokeDasharray={DASH[si % DASH.length]} />;
    });
  } else {
    marks = m.rows.map((row, i) => {
      const x = m.xNumeric ? xLin(xNum[i]) : xBand.at(String(m.xs[i])) + xBand.bw / 2, v = m.ys[i];
      if (v === null) return <text key={i} x={x} y={ih - 2} className="lc-na" textAnchor="middle">×<title>missing</title></text>;
      return <g key={i} className="lc-pt" {...hoverProps(i)}><Mark shape={shapeOf(row)} x={x} y={y(v)} r={m.rows.length > 400 ? 2.2 : 3.2} sel={selected(row) || hover === i} derived={derivedOf(row)} /></g>;
    });
  }

  const hovered = hover !== null ? m.rows[hover] : null;
  const fields = [m.x, m.y, m.color, m.shape].filter(Boolean);
  const derivedAny = m.rows.some(derivedOf);
  const caption = `${m.mark} chart of ${m.y} by ${m.x}${m.color ? `, series by ${m.color}` : ""}; ${m.rows.length} rows${missingCount ? `, ${missingCount} missing` : ""}`;
  return (
    <Panel kind="chart" input={describe} title={m.title}
      footer={`${m.rows.length} rows${missingCount ? ` · ${missingCount} missing values drawn hatched, excluded from the scales` : ""}${derivedAny ? " · derived values stippled" : ""}`}>
      <div ref={wrap} className="lab-chart">
        {m.series.length > 1 || m.shapes.length ? (
          <div className="lc-legend">
            {m.series.length > 1 ? m.series.map((s, i) => <span key={s}><Swatch uid={uid} i={i} kind={m.mark} shape={SHAPES[i % SHAPES.length]} />{s}</span>) : null}
            {m.shapes.map((s) => <span key={`s-${s}`}><Swatch uid={uid} kind="point" shape={OUTCOME_SHAPE[s] ?? SHAPES[m.shapes.indexOf(s) % SHAPES.length]} />{m.shape} {s}</span>)}
          </div>
        ) : null}
        <svg width={W} height={H} role="img" aria-label={caption} className="lc">
          <Patterns uid={uid} />
          <g transform={`translate(${M.l},${M.t})`}>
            {yTicks.map((t) => <g key={t} transform={`translate(0,${y(t)})`}><line x2={iw} className="lc-grid" /><text x={-6} dy="0.32em" textAnchor="end" className="lc-tick">{fmtTick(t, m.yUnit)}</text></g>)}
            <line y1={ih} y2={ih} x2={iw} className="lc-axis" />
            {m.xNumeric
              ? xTicks.map((t) => <text key={t} x={xLin(t)} y={ih + 14} textAnchor="middle" className="lc-tick">{fmtNumber(t, 3)}</text>)
              : categories.map((c) => {
                const cx = xBand.at(c) + xBand.bw / 2;
                return tilt
                  ? <text key={c} transform={`translate(${cx},${ih + 10}) rotate(${(-TILT_RAD * 180) / Math.PI})`} textAnchor="end" className="lc-tick"><title>{c}</title>{tickText(c)}</text>
                  : <text key={c} x={cx} y={ih + 14} textAnchor="middle" className="lc-tick"><title>{c}</title>{tickText(c)}</text>;
              })}
            <text x={iw} y={ih + 28 + tiltH} textAnchor="end" className="lc-label">{String(m.xo.label ?? m.x)}{xUnit ? ` (${xUnit})` : ""}</text>
            <text x={-M.l + 2} y={-10} className="lc-label">{m.y}{m.yUnit ? ` (${m.yUnit})` : ""}{log ? " · log" : ""}</text>
            {marks}
          </g>
        </svg>
        {hovered ? (
          <div className="lc-tip" role="status">
            {fields.map((k) => { const f = formatValue(getPath(hovered, k), k === m.y ? m.yUnit : FIELD_UNITS[k]); return <div key={k}><span className="dim">{k}</span> {f.text}{k === m.y && f.prov ? <span className="dim"> · {f.prov}{f.missing ? ` · ${f.reason}` : ""}</span> : null}</div>; })}
            {isEnt(hovered) ? <div className="dim">{hovered.ref.split("!").pop()} · click to select</div> : null}
          </div>
        ) : null}
        <details className="lc-data">
          <summary>Data table</summary>
          <div className="lab-table">
            <table className="rt">
              <thead><tr>{fields.map((k) => <th key={k}>{k}</th>)}</tr></thead>
              <tbody>{m.rows.slice(0, 40).map((row, i) => <tr key={i}>{fields.map((k) => <td key={k}>{formatValue(getPath(row, k), k === m.y ? m.yUnit : undefined).text}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>
    </Panel>
  );
}

// ----------------------------------------------------------------------------- timeline

const LANE_H = 18, LABEL_W = 104, RULER_H = 22;
// Kernel fill by role, in ink: the operation under study solid, the other families each a fill of their own.
const ROLE_FILL = [
  { re: /^encoder\.sampling$/, label: "sampling", fill: "var(--ink)" },
  { re: /^encoder\.reduce$/, label: "reduce", fill: "var(--ink-2)" },
  { re: /norm$|^rmsnorm$/, label: "norm", fill: "hatch" },
  { re: /softmax|^attention$/, label: "attention", fill: "dots" },
  { re: /transfer/, label: "copy", fill: "var(--bg)" },
];
const roleOf = (k) => ROLE_FILL.find(({ re }) => re.test(String(k.role ?? ""))) ?? (String(k.lane).includes("copy") ? ROLE_FILL[4] : null);
const fillOf = (uid, f) => (f === "hatch" ? `url(#${uid}-hatch)` : f === "dots" ? `url(#${uid}-dots)` : f);

/** One run on its own clock: every lane draws its own events; events narrower than a pixel merge into buckets. */
export function TimelineView({ view }) {
  const ctx = useBoard();
  const [wrap, width] = useWidth();
  const uid = `tl${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = useResolved((res) => ({
    run: runFor(ctx.reg, res(view.args[0])),
    lanes: (view.pa("lanes") ?? []).map((x) => res(x)).flat(),
    win: res(view.p("window")), focus: res(view.p("focus")),
  }), [view, ctx.reg]);
  const run = r.value?.run ?? null;
  const data = useMemo(() => {
    if (!run) return null;
    const src = ctx.reg.source, items = [];
    for (const kind of ["span", "kernel"]) for (const e of src.entities(kind, run.ref)) {
      const s = Number(e.start), en = Number(e.end);
      if (Number.isFinite(s) && Number.isFinite(en)) items.push({ ent: e, lane: String(e.lane), start: s, end: Math.max(en, s + 1) });
    }
    for (const q of src.entities("request", run.ref)) if (Number.isFinite(Number(q.start)) && Number.isFinite(Number(q.end))) items.push({ ent: q, lane: "requests", start: Number(q.start), end: Number(q.end) });
    const found = [...new Set(items.map((i) => i.lane))], preferred = r.value?.lanes ?? [];
    const lanes = ["requests", ...preferred.filter((l) => found.includes(l)), ...found.filter((l) => l !== "requests" && !preferred.includes(l))].filter((l) => found.includes(l));
    const byLane = new Map(lanes.map((l) => [l, items.filter((i) => i.lane === l).sort((a, b) => a.start - b.start)]));
    const t0 = items.length ? Math.min(...items.map((i) => i.start)) : 0, t1 = items.length ? Math.max(...items.map((i) => i.end)) : 1;
    const lost = (run.coverage?.trace?.lost ?? []).map((g) => ({ from: g.from * 1e9, to: g.to * 1e9, reason: g.reason }));
    return { lanes, byLane, t0, t1, lost, kernels: items.filter((i) => i.ent.kind === "kernel").map((i) => i.ent), count: items.length };
  }, [run, ctx.reg, r.value?.lanes]);

  const initial = () => (!data ? [0, 1] : r.value?.win ? [r.value.win[0] * 1e9, r.value.win[1] * 1e9] : [data.t0, data.t1]);
  const [domain, setDomain] = useState(initial);
  const runRef = run?.ref;
  useEffect(() => setDomain(initial()), [runRef, data?.t0, data?.t1]);
  const focus = r.value?.focus, focusRef = isEnt(focus) ? focus.ref : null;
  useEffect(() => {
    if (!isEnt(focus) || String(focus.run) !== runRef) return;
    const s = Number(focus.start), e = Number(focus.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return;
    if (focus.kind === "request") { const pad = (e - s) * 0.04; setDomain([s - pad, e + pad]); return; }
    setDomain(([a, b]) => { const span = Math.max(Math.min(b - a, (e - s) * 40), (e - s) * 6), c = (s + e) / 2; return [c - span / 2, c + span / 2]; });
  }, [focusRef, runRef]);
  const drag = useRef(null);

  if (r.error) return <Panel kind="timeline"><PanelError error={r.error} /></Panel>;
  if (!run || !data) return <Panel kind="timeline" input={typeof view.args[0] === "string" ? view.args[0] : undefined}><div className="lab-empty"><b>Run not imported</b><span>Pick an imported run.</span></div></Panel>;
  if (!data.count) return <Panel kind="timeline" input={run.ref}><div className="lab-empty"><b>No trace events in this run</b><span>{run.ref} is a {String(run.mode)} capture; a timeline needs a trace capture.</span></div></Panel>;

  const [a, b] = domain;
  const iw = Math.max(80, width - LABEL_W - 8);
  const x = linear([a, b], [0, iw]);
  const H = RULER_H + data.lanes.length * (LANE_H + 3) + 6;
  const zoom = (f, at = 0.5) => { const c = a + (b - a) * at, nw = Math.max(2e3, Math.min((data.t1 - data.t0) * 1.5, (b - a) * f)); setDomain([c - nw * at, c + nw * (1 - at)]); };
  const pan = (f) => setDomain([a + (b - a) * f, b + (b - a) * f]);
  const msTicks = niceTicks((a - data.t0) / 1e6, (b - data.t0) / 1e6, Math.max(2, Math.floor(iw / 110)));
  const windowMs = (b - a) / 1e6, inSeconds = windowMs > 5000;
  const select = (ent) => ctx.fire(view, "select", { entity: ent, row: ent });

  const laneRows = data.lanes.map((lane, li) => {
    const top = RULER_H + li * (LANE_H + 3), out = [];
    let bucket = null;
    const flush = () => {
      if (!bucket) return;
      const it = bucket.max;
      out.push(<rect key={`b-${it.ent.ref}`} x={bucket.px} y={top + 2} width={2} height={LANE_H - 4} className="tl-bucket" onClick={() => select(it.ent)}><title>{`${bucket.n} events merged · longest ${String(it.ent.name ?? it.ent.id)} ${fmtNumber((it.end - it.start) / 1e6, 3)} ms`}</title></rect>);
      bucket = null;
    };
    for (const it of data.byLane.get(lane) ?? []) {
      if (it.end < a || it.start > b) continue;
      const x0 = x(it.start), x1 = x(it.end), w = x1 - x0;
      if (w < 1.5) {
        const px = Math.floor(x0 / 2) * 2;
        if (bucket && bucket.px === px) { bucket.n++; if (it.end - it.start > bucket.max.end - bucket.max.start) bucket.max = it; }
        else { flush(); bucket = { px, n: 1, max: it }; }
        continue;
      }
      flush();
      const isSel = it.ent.ref === ctx.selected || it.ent.ref === focusRef, isReq = it.ent.kind === "request";
      const failed = isReq && it.ent.outcome !== "ok";
      const fill = isReq || it.ent.kind === "span" ? "var(--bg)" : fillOf(uid, roleOf(it.ent)?.fill ?? "var(--hair)");
      out.push(
        <g key={it.ent.ref} className={cls("tl-item", isSel && "sel", failed && "bad")} onClick={() => select(it.ent)}>
          <rect x={Math.max(-2, x0)} y={top + 2} width={Math.max(1.5, Math.min(iw + 2, x1) - Math.max(-2, x0))} height={LANE_H - 4} fill={fill} />
          {w > 44 ? <text x={Math.max(2, x0 + 3)} y={top + LANE_H - 6} className={cls("tl-label", fill === "var(--ink)" && "inv")}>{String(it.ent.name ?? it.ent.id).slice(0, Math.floor(w / 6))}</text> : null}
          <title>{`${String(it.ent.name ?? it.ent.id)} · ${fmtNumber((it.end - it.start) / 1e6, 4)} ms · ${lane}${it.ent.role ? ` · ${String(it.ent.role)}` : ""}${failed ? ` · ${String(it.ent.outcome)}` : ""}`}</title>
        </g>,
      );
    }
    flush();
    return <g key={lane}><text x={-8} y={top + LANE_H - 6} textAnchor="end" className="tl-lane">{lane}</text><line x1={0} x2={iw} y1={top + LANE_H + 1} y2={top + LANE_H + 1} className="lc-grid" />{out}</g>;
  });

  return (
    <Panel kind="timeline" input={run.ref} flush
      footer={`clock: ${String(run.clock)} · window ${inSeconds ? `${fmtNumber(windowMs / 1000, 3)} s` : `${fmtNumber(windowMs, 3)} ms`} · ctrl/⌘ + wheel zooms, drag pans, keys + − ← → 0${data.lost.length ? ` · ${data.lost.length} lost interval${data.lost.length > 1 ? "s" : ""} hatched: no events exist there, not zero activity` : ""}`}>
      <div className="tl-tools">
        <button type="button" className="btn sm" onClick={() => zoom(2)} aria-label="Zoom out">−</button>
        <button type="button" className="btn sm" onClick={() => zoom(0.5)} aria-label="Zoom in">+</button>
        <button type="button" className="btn sm" onClick={() => setDomain([data.t0, data.t1])}>whole run</button>
      </div>
      <div ref={wrap} className="lab-tl" tabIndex={0} role="application" aria-label={`Timeline of ${run.ref}; plus and minus zoom, arrow keys pan, 0 resets`}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") zoom(0.5); else if (e.key === "-") zoom(2); else if (e.key === "ArrowLeft") pan(-0.2); else if (e.key === "ArrowRight") pan(0.2); else if (e.key === "0") setDomain([data.t0, data.t1]); else return;
          e.preventDefault();
        }}
        onWheel={(e) => {
          if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect(), at = Math.min(1, Math.max(0, (e.clientX - rect.left - LABEL_W) / iw));
          if (e.shiftKey) pan(e.deltaY > 0 ? 0.1 : -0.1); else zoom(e.deltaY > 0 ? 1.25 : 0.8, at);
        }}
        onPointerDown={(e) => { if (e.target.closest(".tl-item, .tl-bucket")) return; drag.current = { x: e.clientX, d: domain }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drag.current) return; const [da, db] = drag.current.d, shift = (-(e.clientX - drag.current.x) / iw) * (db - da); setDomain([da + shift, db + shift]); }}
        onPointerUp={() => (drag.current = null)}>
        <svg width={width} height={H} role="img" aria-label={`${data.lanes.length} lanes, ${data.count} events`} className="lc">
          <Patterns uid={uid} />
          <g transform={`translate(${LABEL_W},0)`}>
            {msTicks.map((t) => { const px = x(data.t0 + t * 1e6); return <g key={t}><line x1={px} x2={px} y1={RULER_H - 6} y2={H} className="lc-grid" /><text x={px + 2} y={RULER_H - 9} className="lc-tick">{inSeconds ? `${fmtNumber(t / 1000, 4)} s` : `${fmtNumber(t, 4)} ms`}</text></g>; })}
            {data.lost.map((g, i) => (g.to < a || g.from > b ? null : (
              <g key={i}>
                <rect x={Math.max(0, x(g.from))} y={RULER_H} width={Math.max(2, Math.min(iw, x(g.to)) - Math.max(0, x(g.from)))} height={H - RULER_H} fill={`url(#${uid}-miss)`} />
                <text x={Math.max(2, x(g.from) + 4)} y={RULER_H + 11} className="tl-lost">TRACE LOST · {g.reason}</text>
              </g>
            )))}
            {laneRows}
          </g>
        </svg>
      </div>
      <RoleLegend uid={uid} kernels={data.kernels} />
    </Panel>
  );
}

/** Names every fill a set of kernels uses, so a role is never told by its fill alone. Patterns come from `uid`'s SVG. */
function RoleLegend({ uid, kernels }) {
  const used = ROLE_FILL.filter((role) => kernels.some((k) => roleOf(k) === role));
  if (!used.length) return null;
  const key = (fill, label) => <li key={label}><svg width={10} height={10} aria-hidden="true"><rect x={0.5} y={0.5} width={9} height={9} fill={fill} stroke="var(--ink)" /></svg>{label}</li>;
  return <ul className="lc-legend tl-legend" aria-label="Kernel roles">{used.map((role) => key(fillOf(uid, role.fill), role.label))}{key("var(--hair)", "other")}</ul>;
}

// ----------------------------------------------------------------------------- mirror

const MIRROR_LANES = ["cpu:main", "cpu:worker", "cuda:stream 7", "cuda:stream 3", "cuda:copy"];
const LH = 16, GAP = 46, LABEL = 104;

/**
 * Two executions on two clocks, joined by structural correspondence, never drawn as one timeline: the same request
 * in each run, both at one px/ms scale, with dashed connectors between the occurrences of each matched operation.
 * A kernel whose operation has no counterpart in the other run is outlined dashed.
 */
export function MirrorView({ view }) {
  const ctx = useBoard();
  const [wrap, width] = useWidth();
  const uid = `mr${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = useResolved((res) => ({ cmp: res(view.args[0]), index: Number(res(view.p("request")) ?? 0) }), [view]);
  const sides = useMemo(() => {
    const c = r.value?.cmp;
    if (!c?.leftRun || !c?.rightRun) return null;
    const side = (ref) => {
      const run = ctx.reg.source.entity(ref);
      if (!run) return null;
      const reqs = ctx.reg.source.entities("request", ref).filter((q) => Number.isFinite(Number(q.start))).sort((a, b) => Number(a.start) - Number(b.start));
      if (!reqs.length) return null;
      const req = reqs[Math.min(Math.max(0, r.value.index), reqs.length - 1)];
      const items = [...ctx.reg.source.entities("span", ref), ...ctx.reg.source.entities("kernel", ref)].filter((e) => e.request === req.id);
      return { run, req, items, lanes: MIRROR_LANES.filter((l) => items.some((i) => i.lane === l)), t0: Number(req.start), dur: Number(req.end) - Number(req.start) };
    };
    const left = side(c.leftRun), right = side(c.rightRun);
    return left && right ? { left, right } : null;
  }, [r.value, ctx.reg]);
  if (r.error) return <Panel kind="mirror"><PanelError error={r.error} /></Panel>;
  const c = r.value?.cmp;
  if (c?.excluded?.length) return <Panel kind="mirror" stamp="excluded"><p className="lab-err" role="alert">Not comparable: {c.excluded.map((x) => `${x.field} (${String(x.left)} ≠ ${String(x.right)})`).join(", ")}</p></Panel>;
  if (!sides) return <Panel kind="mirror"><div className="lab-empty"><b>Both traces must be imported</b><span>A mirror needs a request with spans and kernels in each run.</span></div></Panel>;

  const iw = Math.max(120, width - LABEL - 4);
  const scale = iw / Math.max(sides.left.dur, sides.right.dur);
  const paired = new Set(c.pairs.map((p) => p.key));
  const leftOnly = new Set(c.unmatched.left.map((u) => u.key)), rightOnly = new Set(c.unmatched.right.map((u) => u.key));
  const showUnmatched = String(view.p("unmatched") ?? "show") === "show";
  const panelH = (s) => 34 + s.lanes.length * (LH + 3);
  const rightTop = panelH(sides.left) + GAP, H = rightTop + panelH(sides.right);
  const pos = (s, e, top) => ({ x: (Number(e.start) - s.t0) * scale, w: Math.max(1, (Number(e.end) - Number(e.start)) * scale), y: top + 26 + s.lanes.indexOf(String(e.lane)) * (LH + 3) });
  const occurrences = (s) => {
    const m = new Map();
    for (const k of s.items.filter((e) => e.kind === "kernel").sort((a, b) => Number(a.start) - Number(b.start))) { const key = String(k.op ?? k.name); m.set(key, [...(m.get(key) ?? []), k]); }
    return m;
  };
  const lo = occurrences(sides.left), ro = occurrences(sides.right), links = [];
  for (const [op, ls] of lo) {
    if (!paired.has(op)) continue;
    const rs = ro.get(op) ?? [], n = Math.min(ls.length, rs.length);
    // at most eight connectors per operation and ninety in all: enough to show the correspondence without hiding the bars
    for (let i = 0; i < n && links.length < 90; i += Math.max(1, Math.floor(n / 8))) {
      const a = pos(sides.left, ls[i], 0), b = pos(sides.right, rs[i], rightTop);
      links.push(<line key={`${op}-${i}`} x1={a.x + a.w / 2} y1={a.y + LH} x2={b.x + b.w / 2} y2={b.y} className="mr-link" />);
    }
  }
  const drawSide = (s, top, only, label) => (
    <g transform={`translate(0,${top})`}>
      <text x={-LABEL + 4} y={12} className="mr-run">{label}</text>
      <text x={0} y={12} className="lc-tick">{s.run.ref} · {s.req.id} · {fmtNumber(s.dur / 1e6, 4)} ms on its own clock</text>
      {s.lanes.map((l, li) => <text key={l} x={-8} y={26 + li * (LH + 3) + LH - 4} textAnchor="end" className="tl-lane">{l}</text>)}
      {s.items.map((e) => {
        const p = pos(s, e, 0), unmatched = e.kind === "kernel" && only.has(String(e.op ?? e.name));
        if (unmatched && !showUnmatched) return null;
        return (
          <rect key={e.ref} x={p.x} y={p.y} width={p.w} height={LH} className={cls("mr-item", e.ref === ctx.selected && "sel", unmatched && "unmatched")}
            fill={e.kind === "span" ? "var(--bg)" : fillOf(uid, roleOf(e)?.fill ?? "var(--hair)")} onClick={() => ctx.fire(view, "select", { entity: e, row: e })}>
            <title>{`${String(e.name)} · ${fmtNumber(Number(e.dur), 3)} ms${unmatched ? " · no counterpart in the other run" : ""}`}</title>
          </rect>
        );
      })}
    </g>
  );
  return (
    <Panel kind="mirror" input={`${c.leftRun} ↔ ${c.rightRun}`} stamp="structural match · separate clocks" flush
      footer={`${c.pairs.length} operations matched by op · ${c.unmatched.left.length} only in baseline · ${c.unmatched.right.length} only in candidate · dashed outline = no counterpart · both rows share one px/ms scale, not one clock`}>
      <div ref={wrap} className="lab-mirror">
        <svg width={width} height={H + 4} role="img" aria-label={`Request ${sides.left.req.id} in two runs, joined by corresponding operations`} className="lc">
          <Patterns uid={uid} />
          <g transform={`translate(${LABEL},2)`}>{drawSide(sides.left, 0, leftOnly, "BASELINE")}{links}{drawSide(sides.right, rightTop, rightOnly, "CANDIDATE")}</g>
        </svg>
      </div>
      <RoleLegend uid={uid} kernels={[...sides.left.items, ...sides.right.items].filter((e) => e.kind === "kernel")} />
    </Panel>
  );
}
