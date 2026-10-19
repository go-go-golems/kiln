// The board panels that are not charts (guide §33), ported from Perf Lab's views onto Kiln's vocabulary: `.rt`
// tables, `.val` cells with their provenance mark, `.stamp` words, `.hyp` cards, `.kv` lists. A panel reads its
// inputs through the board (useResolved), so a parameter or signal change re-renders it with the new rows.
import React, { useMemo, useState } from "react";
import { cls, Seg, Kv } from "../common.jsx";
import { tex } from "../doc.js";
import { Panel, PanelError, Rich, useBoard, useResolved } from "./board.jsx";
import { formatValue, fieldLabel, sourceLink } from "./format.js";
import { isValue, isEnt, isQuery, getPath, FIELD_UNITS, makeDollar, normalizeOptions, evaluateHypothesis } from "./api.js";

/** One value: its provenance mark (a plain cell has none), its text, and a title saying how it was obtained. */
export function LabVal({ x, unit, mark = true }) {
  const f = formatValue(x, unit);
  return (
    <span className={cls("val", f.missing && "missing")} title={f.title || undefined}>
      {mark && f.prov ? <i className={cls("prov", f.prov)} /> : null}
      <span className={f.missing ? "hatched lab-miss" : undefined}>{f.text}</span>
      {f.missing && f.reason ? <span className="sr-only">missing: {f.reason}</span> : null}
    </span>
  );
}

const unitOf = (field) => FIELD_UNITS[String(field).split(".").pop()] ?? FIELD_UNITS[String(field).split(".")[0]];
const Empty = ({ title, hint }) => <div className="lab-empty"><b>{title}</b>{hint ? <span>{hint}</span> : null}</div>;

// ----------------------------------------------------------------------------- table

const LIMIT = 200;
const inferCols = (row) => Object.keys(row).filter((k) => {
  const v = row[k];
  return !["kind", "ref", "run", "metrics", "manifest"].includes(k) && (v === null || typeof v !== "object" || isValue(v) || Array.isArray(v));
}).slice(0, 8);

export function TableView({ view }) {
  const ctx = useBoard();
  const [cursor, setCursor] = useState(0);
  const input = view.args[0];
  const r = useResolved((res) => {
    const rows = res(input);
    return { rows: Array.isArray(rows) ? rows : rows == null ? [] : [rows], cols: (view.pa("cols") ?? []).map((c) => res(c)).flat(), title: res(view.p("title")) };
  }, [view]);
  const rows = r.value?.rows ?? [];
  const cols = useMemo(() => (r.value?.cols?.length ? r.value.cols : rows[0] ? inferCols(rows[0]) : []), [r.value, rows]);
  const describe = isQuery(input) ? input.describe() : undefined;
  if (r.error) return <Panel kind="table" input={describe}><PanelError error={r.error} /></Panel>;
  const shown = rows.slice(0, LIMIT);
  const pick = (i) => { if (!shown[i]) return; setCursor(i); ctx.fire(view, "select", { row: shown[i], entity: isEnt(shown[i]) ? shown[i] : undefined }); };
  const derived = rows.some((x) => x.__prov === "derived");
  return (
    <Panel kind="table" input={describe} title={r.value?.title ? String(r.value.title) : undefined} flush
      footer={`${rows.length} row${rows.length === 1 ? "" : "s"}${rows.length > LIMIT ? ` · showing ${LIMIT}` : ""}${derived ? " · ◐ derived aggregates" : ""}`}>
      {!rows.length ? <Empty title="No rows" hint="Nothing matches, or the capture that produces these rows has not been imported." /> : (
        <div className="lab-table">
          <table className="rt">
            <thead><tr>{cols.map((c) => <th key={c} scope="col" title={c} className={numericCol(shown, c) ? "num" : undefined}>{fieldLabel(c)}</th>)}</tr></thead>
            <tbody onKeyDown={(e) => {
              const body = e.currentTarget;
              const move = (next) => { e.preventDefault(); setCursor(next); requestAnimationFrame(() => body.children[next]?.focus()); };
              if (e.key === "ArrowDown") move(Math.min(shown.length - 1, cursor + 1));
              if (e.key === "ArrowUp") move(Math.max(0, cursor - 1));
              if (e.key === "Enter") { e.preventDefault(); pick(cursor); }
            }}>
              {shown.map((row, i) => (
                <tr key={isEnt(row) ? row.ref : i} tabIndex={i === cursor ? 0 : -1} className={cls("clickable", ctx.selected && isEnt(row) && row.ref === ctx.selected && "sel")} onClick={() => pick(i)}>
                  {cols.map((c) => {
                    const v = getPath(row, c), numeric = typeof v === "number" || isValue(v);
                    return <td key={c} className={numeric ? "num" : undefined}>{numeric || v == null ? <LabVal x={v} unit={isValue(v) ? undefined : unitOf(c)} /> : <span className="lab-text" title={String(v)}>{typeof v === "boolean" ? (v ? "yes" : "no") : Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
const numericCol = (rows, c) => rows.some((r) => { const v = getPath(r, c); return typeof v === "number" || isValue(v); });

// ----------------------------------------------------------------------------- stat

const isEstimate = (x) => typeof x === "object" && x !== null && x.__estimate === true;

/** A display figure: the value with its mark, its label, and for a paired estimate its interval and method. */
export function StatView({ view }) {
  const r = useResolved((res) => ({ value: res(view.args[0]), label: res(view.args[1]) }), [view]);
  if (r.error) return <Panel kind="stat"><PanelError error={r.error} /></Panel>;
  const v = r.value.value, label = String(r.value.label ?? "");
  const est = isEstimate(v);
  const x = est ? v.median : v === undefined ? { __value: true, value: null, prov: "unknown", reason: "no value for this selection" } : v;
  const f = formatValue(x);
  const lo = est && v.ci ? formatValue(v.ci[0]) : null, hi = est && v.ci ? formatValue(v.ci[1]) : null;
  return (
    <section className="lpanel lab-stat" aria-label={`stat: ${label}`}>
      <div className="bignum" title={f.title || undefined}>
        <b className={f.missing ? "lab-miss" : undefined}>{f.prov ? <i className={cls("prov", f.prov)} /> : null}{f.text}</b>
        <span>{label}</span>
      </div>
      {lo && hi ? <p className="lab-ci">{Math.round((v.level ?? 0.95) * 100)} % CI {lo.text} – {hi.text}</p> : null}
      {est ? <p className="lp-foot">paired · unit = {v.unit} · {v.note}</p> : null}
      {f.missing && f.reason ? <p className="lp-foot">missing: {f.reason}</p> : null}
    </section>
  );
}

// ----------------------------------------------------------------------------- runs and manifests

/** A run's state in words: validity, quality gate, coverage and origin; only an invalid run is red. */
export function RunStamps({ run }) {
  const v = run.validity ?? { ok: false, reasons: ["no validity"] }, q = run.quality ?? {}, cov = run.coverage ?? {};
  return (
    <span className="lab-stamps">
      <span className={cls("stamp", v.ok ? "solid" : "bad")} title={v.reasons?.join("; ") || "valid"}>{v.ok ? "✓ valid" : "invalid"}</span>
      <span className={cls("stamp", q.status === "qualified" && "solid")}>{q.status ?? "unqualified"}</span>
      <span className="stamp">{cov.complete ? "coverage complete" : "coverage gaps"}</span>
      <span className={cls("stamp", run.synthetic === false && "solid")} title={run.synthetic === false ? "imported from a measured run" : "generated by the synthetic source"}>{run.synthetic === false ? "measured" : "synthetic"}</span>
    </span>
  );
}

export function RunListView({ view }) {
  const ctx = useBoard();
  const r = useResolved((res) => ctx.reg.source.runs(String(res(view.args[0]))), [view, ctx.reg]);
  if (r.error) return <Panel kind="runs"><PanelError error={r.error} /></Panel>;
  const runs = r.value ?? [];
  const invalid = runs.filter((x) => !x.validity?.ok).length;
  return (
    <Panel kind="runs" input={String(view.args[0])} footer={`${runs.length} run${runs.length === 1 ? "" : "s"} · ${invalid} invalid`} flush>
      {!runs.length ? <Empty title="No runs imported" /> : (
        <ul className="lab-runs">
          {runs.map((run) => (
            <li key={run.ref}>
              <button type="button" className={cls(ctx.selected === run.ref && "sel")} onClick={() => ctx.fire(view, "select", { entity: run, row: run })}>
                <span className="mono lab-ref">{run.ref}</span>
                <span className="mono dim lab-act">{Object.entries(run.activation ?? {}).filter(([k]) => k !== "reason").map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
                <RunStamps run={run} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** A run entity from a run, an entity of a run, or a run reference ("exp/arm/mode" or "exp/arm/mode#rep"). */
export function runFor(reg, x) {
  if (isEnt(x)) return x.kind === "run" ? x : reg.source.entity(String(x.run)) ?? null;
  if (typeof x !== "string") return null;
  return reg.source.entity(x.includes("#") ? x : `${x}#0`) ?? null;
}

const fmtField = (v) => (v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k}=${String(x)}`).join(" · ") : v == null ? "—" : String(v));

function manifestRows(run) {
  const m = run.manifest ?? {}, v = run.validity ?? { ok: false, reasons: [] }, act = run.activation ?? {};
  const cov = run.coverage ?? {}, lost = cov.trace?.lost ?? [], srcMissing = cov.source?.missing ?? [], linksMissing = cov.links?.missing ?? [];
  return [
    ["run", run.ref], ["host", m.host], ["revision", m.revision], ["workload", m.workload], ["boundary", m.boundary], ["fixtures", m.fixtures], ["precision", m.precision],
    ...(m.impl ? [["implementation", m.impl], ["device", m.device], ["threads", m.threads]] : []),
    ["state", m.state ? fmtField(m.state) : "—"],
    ["activation", Object.entries(act).map(([k, x]) => `${k} ${String(x)}`).join(" · ") || "—"],
    ["validity", v.ok ? "valid" : v.reasons.join("; "), !v.ok],
    ["quality gate", m.gate ?? "none declared"], ["toolchain", m.toolchain], ["clock", run.clock],
    ["trace lost", lost.length ? lost.map((g) => `${g.from}–${g.to} s (${g.reason})`).join("; ") : "none"],
    ["source missing", srcMissing.length ? srcMissing.map((s) => s.code).join(", ") : "none"],
    ["links missing", linksMissing.length ? linksMissing.map((l) => `${l.count} × ${l.rel}: ${l.reason}`).join("; ") : "none"],
    ["spec hash", m.specHash], ["started", run.startedAt],
  ].map(([k, x, bad]) => [k, <span className="lab-kv">{x == null ? "—" : String(x)}</span>, bad]);
}

export function ManifestView({ view }) {
  const { reg } = useBoard();
  const r = useResolved((res) => runFor(reg, res(view.args[0])), [view, reg]);
  if (r.error) return <Panel kind="manifest"><PanelError error={r.error} /></Panel>;
  const run = r.value;
  return (
    <Panel kind="manifest" input={run?.ref}>
      {run ? <><RunStamps run={run} /><Kv rows={manifestRows(run)} /></> : <Empty title="Run not imported" hint="This run is not in the artifact store." />}
    </Panel>
  );
}

// Fields whose difference invalidates a comparison, and the fields that are the treatment on purpose.
const INVALIDATING = ["workload", "boundary", "fixtures", "precision", "host", "inputSize", "gate", "state", "device", "threads"];
const TREATMENT = ["revision", "impl"];

export function ManifestDiffView({ view }) {
  const { reg } = useBoard();
  const r = useResolved((res) => [runFor(reg, res(view.args[0])), runFor(reg, res(view.args[1]))], [view, reg]);
  if (r.error) return <Panel kind="manifest diff"><PanelError error={r.error} /></Panel>;
  const [a, b] = r.value ?? [null, null];
  if (!a || !b) return <Panel kind="manifest diff"><Empty title="Both runs must be imported" /></Panel>;
  const ma = a.manifest ?? {}, mb = b.manifest ?? {};
  const fields = ["host", "workload", "boundary", "fixtures", "precision", "inputSize", "state", "gate", "toolchain", "revision", ...(ma.impl || mb.impl ? ["impl", "device", "threads"] : []), "arm", "mode"];
  const same = (f) => JSON.stringify(ma[f]) === JSON.stringify(mb[f]);
  const excludes = fields.filter((f) => INVALIDATING.includes(f) && !same(f));
  const treatment = TREATMENT.filter((f) => fields.includes(f) && !same(f));
  const footer = excludes.length
    ? `Comparison excluded: ${excludes.join(", ")} differ.`
    : `Identity matches on every field that would invalidate the comparison; ${treatment.length ? `the treatment is the ${treatment.map((f) => (f === "impl" ? "implementation" : f)).join(" and the ")}` : "no treatment field differs"}.`;
  return (
    <Panel kind="manifest diff" input={`${a.ref} ↔ ${b.ref}`} footer={footer}>
      <div className="lab-table">
        <table className="rt lab-mdiff">
          <thead><tr><th scope="col">field</th><th scope="col" className="mono">{a.ref}</th><th scope="col" className="mono">{b.ref}</th><th scope="col"><span className="sr-only">verdict</span></th></tr></thead>
          <tbody>
            {fields.map((f) => {
              const bad = !same(f) && INVALIDATING.includes(f);
              return (
                <tr key={f} className={cls(bad && "badrow", same(f) && "dimrow")}>
                  <th scope="row">{f}</th><td>{fmtField(ma[f])}</td><td>{fmtField(mb[f])}</td>
                  <td>{bad ? <span className="stamp bad">excludes</span> : !same(f) ? <span className="stamp solid">{TREATMENT.includes(f) ? "treatment" : "differs"}</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="lab-stamps-2"><RunStamps run={a} /><RunStamps run={b} /></div>
    </Panel>
  );
}

// ----------------------------------------------------------------------------- hypotheses

const VERDICT = {
  supported: { cls: "solid", text: "✓ supported", why: "every predicted row satisfies the prediction" },
  refuted: { cls: "bad", text: "✕ refuted", why: "a predicted row contradicts the prediction" },
  open: { cls: "", text: "open", why: "evidence is missing for at least one predicted row" },
  unqualified: { cls: "bad", text: "unqualified", why: "a supporting run is invalid" },
};

/** A lab hypothesis as Kiln's hypothesis card: the verdict from @kiln/lab, the judged rows, support, alternatives. */
export function HypothesisCardView({ view }) {
  const ctx = useBoard();
  const id = String(view.args[0]);
  const res = useMemo(() => { try { return { v: evaluateHypothesis(ctx.reg, ctx.state, id) }; } catch (error) { return { error }; } }, [ctx.reg, ctx.state, id]);
  if (res.error) return <Panel kind="hypothesis" input={id}><PanelError error={res.error} /></Panel>;
  const { h, checks, support, verdict, reasons } = res.v;
  const v = VERDICT[verdict] ?? VERDICT.open;
  return (
    <section className="lpanel flush" aria-label={`hypothesis ${id}: ${verdict}`}>
      <div className="hyp">
        <div className="hyp-h">
          <span className={cls("stamp", v.cls)} title={reasons?.join("\n") || v.why}>{v.text}</span>
          <span className="mono dim">{id}</span>
        </div>
        <Rich as="p" className="hyp-claim" text={h.claimText} />
        <p className="hyp-pred dim">{v.why}</p>
        {checks.length ? <Judged checks={checks} /> : null}
        {verdict !== "supported" && reasons?.length ? <ul className={cls("reasons", (verdict === "refuted" || verdict === "unqualified") && "bad")}>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
        <dl className="hyp-meta">
          <dt>support</dt>
          <dd>{support.length ? <ul>{support.map((s, i) => <li key={i}><span className="mono">{s.describe}</span> — {s.count} row{s.count === 1 ? "" : "s"}{s.invalid.length ? <span className="bad"> · invalid runs: {s.invalid.join(", ")}</span> : null}</li>)}</ul> : "no supporting query declared"}</dd>
          {h.alternativesList?.length ? <><dt>alternatives</dt><dd><ul>{h.alternativesList.map((a) => <li key={a}><Rich text={a} /></li>)}</ul></dd></> : null}
          {h.scopeText ? <><dt>scope</dt><dd><Rich text={h.scopeText} /></dd></> : null}
        </dl>
      </div>
    </section>
  );
}

// The rows the prediction judged: each field in its own column under its name, then the row's own result.
function Judged({ checks }) {
  const keys = [];
  for (const c of checks) for (const k of Object.keys(c.row)) if (!keys.includes(k) && !String(k).startsWith("__")) keys.push(k);
  return (
    <div className="hyp-rows">
      <table className="rt">
        <thead><tr>{keys.slice(0, 7).map((k) => <th key={k} className="num mono">{k}</th>)}<th>judged</th></tr></thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={i}>
              {keys.slice(0, 7).map((k) => { const x = c.row[k]; return <td key={k} className="num">{typeof x === "object" && x !== null && !isValue(x) ? <span className="dim">…</span> : <LabVal x={x} unit={unitOf(k)} />}</td>; })}
              <td>{c.pass === true ? <span className="okword">✓ holds</span> : c.pass === false ? <span className="bad">✕ fails</span> : <span className="dim" title={c.error ? `the predicate threw: ${c.error}` : c.missing?.length ? `missing ${c.missing.join(", ")}` : "the predicate returned no decision"}>undecided</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------- text, notes, math, source

const SIZES = { sm: "var(--fs-xs)", md: "var(--fs-s)", lg: "var(--fs-m)", xl: "var(--fs-l)", "2xl": "var(--fs-xl)" };

export function TextView({ view }) {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <PanelError error={r.error} />;
  const text = r.value == null ? "" : String(r.value);
  if (!text) return null;
  return <Rich as="p" className={cls("lab-textview", view.props?.mono && "mono", view.p("color") === "muted" && "dim")} text={text} />;
}

export function NoteView({ view }) {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <PanelError error={r.error} />;
  return <div className="lab-note">{String(r.value ?? "").split(/\n{2,}/).map((p, i) => <Rich as="p" key={i} text={p} />)}</div>;
}

/** `math(tex, { display, caption })`: a formula on its own, display style unless `display: false`. */
export function MathView({ view }) {
  const r = useResolved((res) => ({ tex: String(res(view.args[0]) ?? ""), opts: res(view.args[1]) ?? {} }), [view]);
  if (r.error) return <PanelError error={r.error} />;
  return (
    <figure className="lab-math">
      <div dangerouslySetInnerHTML={{ __html: tex(r.value.tex, r.value.opts.display !== false) }} />
      {r.value.opts.caption ? <Rich as="figcaption" text={r.value.opts.caption} /> : null}
    </figure>
  );
}

export function SourceRef({ refText, evidence }) {
  const l = sourceLink(refText);
  return (
    <span className="mono lab-src">
      {l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.rev ? `${l.rev}:` : ""}{l.path}{l.symbol ? `#${l.symbol}` : ""}</a> : refText}
      {evidence ? <span className="dim"> · {evidence}</span> : null}
    </span>
  );
}

export function SourceView({ view }) {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <Panel kind="source"><PanelError error={r.error} /></Panel>;
  const v = r.value;
  const ref = isEnt(v) ? v.source : typeof v === "object" && v !== null && "ref" in v ? String(v.ref) : v;
  return <Panel kind="source">{ref ? <SourceRef refText={ref} /> : <Empty title="No source mapping" hint={isEnt(v) ? String(v.sourceReason ?? "") : "Select a kernel with a source map"} />}</Panel>;
}

// ----------------------------------------------------------------------------- controls

/** An ad hoc control bound to a board signal (`toggle([...]).bind(sig)`), as opposed to a declared parameter. */
export function ControlView({ view }) {
  const ctx = useBoard();
  const spec = view.args[0], sig = view.args[1];
  const value = makeDollar(ctx.reg, ctx.state)(sig);
  if (spec.control === "slider") {
    return (
      <label className="lab-param"><span>{sig.name}</span>
        <span className="lab-slider"><input type="range" min={spec.c.min ?? 0} max={spec.c.max ?? 1} step={spec.c.step ?? "any"} value={Number(value)} onChange={(e) => ctx.setRef(sig, Number(e.target.value))} /><output className="mono">{String(value)}</output></span>
      </label>
    );
  }
  const options = (normalizeOptions(spec.c.options) ?? []).map((o) => o.value);
  return <div className="lab-param"><span>{sig.name}</span><Seg sm label={sig.name} items={options.map((o) => [o, String(o)])} value={value} onChange={(v) => ctx.setRef(sig, v)} /></div>;
}
