// Panels that follow one thing in depth (guide §33), ported from Perf Lab: a kernel and its counters, a query walked
// one hop at a time with the evidence behind each hop, a memory ledger within one scope, and an illustrative
// walkthrough of an algorithm. Each says what kind of reading it is: a structural match, a missing link, an
// illustrative fixture.
import React, { useEffect, useMemo, useState } from "react";
import { Btn, cls } from "../common.jsx";
import { tex } from "../doc.js";
import { Panel, PanelError, Rich, useBoard, useResolved } from "./board.jsx";
import { LabVal, SourceRef } from "./panels.jsx";
import { isEnt, isQuery, Query, queryEnv, rows as toRows, getPath, fmtBytes, fmtNumber, walkthrough } from "./api.js";

const Empty = ({ title, hint }) => <div className="lab-empty"><b>{title}</b>{hint ? <span>{hint}</span> : null}</div>;

// ----------------------------------------------------------------------------- kernel card

const DEFAULT_METRICS = [
  "gpu__time_duration.sum", "launch__registers_per_thread", "launch__shared_mem_per_block_static",
  "sm__warps_active.avg.pct_of_peak_sustained_active", "sm__maximum_warps_per_active_cycle_pct",
  "dram__bytes_read.sum", "dram__bytes_write.sum", "lts__t_bytes.sum",
  "smsp__average_warps_issue_stalled_long_scoreboard_per_issue_active.ratio", "smsp__pcsamp_warps_issue_stalled_barrier",
];

/** Every metric with its unit, scope, denominator and source; an unavailable counter stays visible as missing. */
export function MetricsTable({ entity, names }) {
  const list = [...new Set([...(names ?? DEFAULT_METRICS), ...Object.keys(entity.metrics ?? {})])];
  return (
    <div className="lab-table">
      <table className="rt">
        <thead><tr><th>metric</th><th className="num">value</th><th>scope · denominator</th></tr></thead>
        <tbody>
          {list.map((name) => {
            const v = entity.metric(name);
            return <tr key={name}><th scope="row" className="mono lab-metric" title={v.method ?? v.reason}>{name}</th><td className="num"><LabVal x={v} /></td><td className="dim">{v.value === null ? v.reason : [v.scope, v.denominator].filter(Boolean).join(" · ")}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A kernel and its counters. A traced kernel carries no counters; when a counter capture of the same experiment and
 * arm profiled a kernel of the same name, its metrics are shown as a structural match, and the footer says so.
 */
export function KernelCardView({ view }) {
  const { reg } = useBoard();
  const r = useResolved((res) => {
    const v = res(view.args[0]);
    return { k: isEnt(v) ? v : Array.isArray(v) ? v.find(isEnt) ?? null : null, names: view.args[1] ? res(view.args[1]) : undefined };
  }, [view]);
  if (r.error) return <Panel kind="kernel"><PanelError error={r.error} /></Panel>;
  const k = r.value?.k ?? null;
  if (!k || k.kind !== "kernel") return <Panel kind="kernel"><Empty title="No kernel selected" hint="Select a kernel on a timeline or in a mirror." /></Panel>;
  let counters = k, match = null;
  if (!k.metrics) {
    const [exp, arm] = String(k.run).split("/");
    const twin = reg.source.entities("kernel", `${exp}/${arm}/kernels#*`).find((x) => x.name === k.name && x.metrics && Object.keys(x.metrics).length);
    if (twin) { counters = twin; match = `counters from ${twin.run} — a different run, matched by kernel name (structural, not the same launch)`; }
  }
  const code = k.code ? reg.source.entity(`${k.run}!code:${String(k.code)}`) : undefined;
  return (
    <Panel kind="kernel" input={String(k.run)} stamp={match ? "structural match" : undefined}
      footer={match ?? (counters.metrics ? `counters from ${String(counters.run)}` : "no counter capture covers this kernel; the values below are missing, not zero")}>
      <div className="lab-kcard">
        <b className="mono lab-kname">{String(k.name)}</b>
        <div className="lab-stamps">
          <span className="stamp">{String(k.role ?? "kernel")}</span>
          {k.op ? <span className="stamp">{String(k.op)}</span> : null}
          {k.selected ? <span className="stamp solid">profiled launch</span> : null}
          <span className="dim">{fmtNumber(Number(k.dur), 3)} ms · grid {String(k.grid ?? "—")} · block {String(k.block ?? "—")}</span>
        </div>
        <div>{code?.source ? <SourceRef refText={String(code.source)} evidence="compiled_from · direct" /> : <span className="dim">source unavailable — {String(code?.sourceReason ?? "no code object")}</span>}</div>
        <MetricsTable entity={counters} names={r.value?.names} />
      </div>
    </Panel>
  );
}

// ----------------------------------------------------------------------------- route

/** Walks a query one operator at a time and reports, per hop, how many entities it reached and on what evidence. */
export function RouteView({ view }) {
  const ctx = useBoard();
  const result = useMemo(() => {
    try {
      const q = ctx.resolveLazy(view.args[0]);
      if (!isQuery(q)) return { hops: [] };
      const env = queryEnv(ctx.reg, ctx.state);
      let cur = new Query(q.root).evaluate(env);
      const hops = [{ label: q.describe().split(".follow")[0].slice(0, 90), kind: "start", count: cur.length, evidence: {}, methods: [], sample: [...cur].filter(isEnt).slice(0, 3) }];
      for (const op of q.ops) {
        const args = op.args.map((a) => (typeof a === "function" ? a : env.resolveArg(a)));
        if (op.method === "follow" || op.method === "back") {
          const evidence = {}, methods = new Set();
          for (const e of cur) {
            if (!isEnt(e)) continue;
            for (const rel of args) for (const l of ctx.reg.source.links(e.ref, rel, op.method === "follow" ? "fwd" : "back")) { evidence[l.evidence] = (evidence[l.evidence] ?? 0) + 1; if (l.method) methods.add(l.method); }
          }
          const next = cur[op.method](...args);
          let missing;
          if (!next.length && cur.length) {
            const gaps = ctx.reg.source.entity(String(cur[0].run))?.coverage?.links?.missing ?? [];
            missing = gaps.find((g) => args.includes(g.rel))?.reason ?? "no link recorded for this relationship";
          }
          hops.push({ label: `${op.method === "back" ? "←" : "→"} ${args.join(" | ")}`, kind: "follow", count: next.length, evidence, methods: [...methods], sample: [...next].slice(0, 3), missing });
          cur = next;
        } else {
          const next = cur[op.method](...args);
          cur = Array.isArray(next) ? next : next ? toRows([next]) : toRows([]);
          hops.push({ label: `.${op.method}(${args.map((a) => (typeof a === "function" ? "ƒ" : a instanceof RegExp ? String(a) : JSON.stringify(a))).join(", ")})`, kind: "filter", count: cur.length, evidence: {}, methods: [], sample: [...cur].filter(isEnt).slice(0, 3) });
        }
      }
      return { hops };
    } catch (error) { return { hops: [], error }; }
  }, [ctx.resolveLazy, ctx.reg, ctx.state, view]);
  if (result.error) return <Panel kind="route"><PanelError error={result.error} /></Panel>;
  const gaps = result.hops.filter((h) => h.missing || (h.kind === "follow" && h.count === 0)).length;
  return (
    <Panel kind="route" footer={gaps ? `${gaps} hop${gaps > 1 ? "s" : ""} without evidence — the route stops there rather than guessing` : "every hop is backed by a recorded relationship"}>
      {!result.hops.length ? <Empty title="No route" hint="Select a request to trace it to its kernel." /> : (
        <ol className="lab-route">
          {result.hops.map((h, i) => (
            <li key={i} className={cls(h.kind, h.missing && "missing")}>
              <span className="mono lab-hop">{h.label}</span>
              <b className="num">{h.count}</b>
              <span className="lab-stamps">
                {Object.entries(h.evidence).map(([ev, n]) => <span key={ev} className={cls("stamp", ev === "direct" && "solid")} title={h.methods.join(", ")}>{ev} ×{n}</span>)}
                {h.missing ? <span className="stamp bad">missing · {h.missing}</span> : null}
              </span>
              <span className="lab-sample">{h.sample.map((e) => <button key={e.ref} type="button" className="link mono" onClick={() => ctx.fire(view, "select", { entity: e })} title={e.ref}>{String(e.name ?? e.id)}</button>)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------------------- ledger

/** One bar per group within a single ledger scope. Bars from different scopes are never summed. */
export function LedgerView({ view }) {
  const ctx = useBoard();
  const r = useResolved((res) => ({ rows: res(view.args[0]), group: String(res(view.p("groupBy")) ?? "run"), scope: res(view.p("scope")), title: res(view.p("title")) }), [view]);
  if (r.error) return <Panel kind="ledger"><PanelError error={r.error} /></Panel>;
  const rows = (Array.isArray(r.value.rows) ? r.value.rows : []).filter(isEnt);
  const scopes = [...new Set(rows.map((a) => String(a.scope)))];
  const groups = new Map();
  for (const a of rows) { const k = String(getPath(a, r.value.group) ?? "—"); groups.set(k, [...(groups.get(k) ?? []), a]); }
  const totals = [...groups.entries()].map(([k, list]) => ({ k, list: [...list].sort((a, b) => Number(b.bytes) - Number(a.bytes)), total: list.reduce((s, a) => s + Number(a.bytes ?? 0), 0) }));
  const max = Math.max(1, ...totals.map((t) => t.total));
  return (
    <Panel kind="ledger" input={`scope ${r.value.scope ?? scopes.join(", ")}`} title={r.value.title}
      footer={`${rows.length} entries · totals add the listed entries regardless of when each was alive, within one scope (${scopes.join(", ") || "—"}); allocator, graph and process scopes overlap and are never added together`}>
      {!rows.length ? <Empty title="No ledger entries" hint="This scope has no entries in the imported memory captures." /> : (
        <div className="lab-ledger">
          {totals.map((t) => (
            <div key={t.k} className="lab-lrow">
              <span className="mono lab-llabel" title={t.k}>{t.k}</span>
              <div className="lab-lbar" style={{ width: `${(t.total / max) * 100}%` }}>
                {t.list.map((a, i) => (
                  <button key={a.ref} type="button" className={cls("lab-lseg", a.retainedBy && "retained", i % 2 && "alt", ctx.selected === a.ref && "sel")} style={{ flexGrow: Number(a.bytes) || 1 }}
                    title={`${String(a.name)} · ${fmtBytes(Number(a.bytes))} · ${String(a.lifetime ?? "")}${a.retainedBy ? ` · retained by ${String(a.retainedBy)}` : ""} · source ${String(a.source ?? "—")}`}
                    onClick={() => ctx.fire(view, "select", { entity: a, row: a })}><span className="sr-only">{String(a.name)}</span></button>
                ))}
              </div>
              <span className="num">{fmtBytes(t.total)}</span>
            </div>
          ))}
          <div className="lc-legend"><span><i className="lab-lkey retained" />retained by a graph generation</span><span><i className="lab-lkey" />released or request-scoped</span></div>
        </div>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------------------- stepper

/** A deterministic walkthrough over a small fixture. Everything it shows is illustrative, and stamped so. */
export function StepperView({ view }) {
  const r = useResolved((res) => {
    const spec = view.args[0];
    const opts = Object.fromEntries(Object.entries(spec.opts).map(([k, v]) => [k, res(v)]));
    return { w: walkthrough(spec.kind, opts, res(view.p("compare"))), impl: view.p("implements")?.ref, caveat: res(view.p("caveat")), kind: spec.kind };
  }, [view]);
  const [step, setStep] = useState(0);
  const key = JSON.stringify(r.value?.w?.groups.map((g) => g.cells.map((c) => c.value)));
  useEffect(() => setStep(0), [key]);
  if (r.error) return <Panel kind="stepper"><PanelError error={r.error} /></Panel>;
  const { w, impl, caveat, kind } = r.value;
  const last = w.steps.length - 1, s = w.steps[Math.min(step, last)], lit = new Set(s?.highlight ?? []);
  return (
    <Panel kind="stepper" input={`algo.${kind}`} stamp="illustrative" footer="Computed from a small fixture; not recovered GPU state and not a measurement.">
      <div className="lab-stepper" tabIndex={0} role="group" aria-label={`${w.title}, step ${step + 1} of ${w.steps.length}; left and right arrows step`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); setStep((x) => Math.min(last, x + 1)); }
          if (e.key === "ArrowLeft") { e.preventDefault(); setStep((x) => Math.max(0, x - 1)); }
        }}>
        <h4>{w.title}</h4>
        <div className="lab-math" dangerouslySetInnerHTML={{ __html: tex(w.formula, true) }} />
        {w.groups.map((g) => (
          <div key={g.id} className="lab-sgroup">
            <span className="note">{g.label}</span>
            <div className="lab-sgrid" style={{ gridTemplateColumns: `repeat(${Math.min(g.cols, 8)}, minmax(54px, 1fr))` }}>
              {g.cells.map((c) => (
                <div key={c.id} className={cls("lab-scell", lit.has(c.id) && "lit")}>
                  <Rich className="dim" text={c.label} />
                  <b className="num">{c.value}</b>
                  {c.sub ? <Rich className="dim" text={c.sub} /> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="lab-sctl">
          <Btn sm onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0} aria-label="Previous step">‹</Btn>
          <span className="num">step {step + 1} / {w.steps.length}</span>
          <Btn sm onClick={() => setStep((x) => Math.min(last, x + 1))} disabled={step >= last} aria-label="Next step">›</Btn>
          <b>{s?.title}</b>
          <Rich className="dim" text={s?.detail ?? ""} />
        </div>
        {w.counters ? <dl className="kv lab-scount">{w.counters.map((c) => <React.Fragment key={c.label}><dt>{c.label}</dt><dd className="num">{c.value}</dd></React.Fragment>)}</dl> : null}
        <ul className="lab-snotes">{w.notes.map((n) => <li key={n}><Rich text={n} /></li>)}</ul>
        {caveat ? <Rich as="p" className="lab-caveat" text={caveat} /> : null}
        {impl ? <p className="note">implements <SourceRef refText={impl} evidence="illustrative link" /></p> : null}
      </div>
    </Panel>
  );
}

// ----------------------------------------------------------------------------- batch

/** A batch's logical request order against its physical batch positions, and the inverse permutation between them. */
export function BatchView({ view }) {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <Panel kind="batch"><PanelError error={r.error} /></Panel>;
  const b = isEnt(r.value) ? r.value : Array.isArray(r.value) ? r.value.find(isEnt) ?? null : null;
  if (!b) return <Panel kind="batch"><Empty title="No request selected" hint="Select a point in the chart to see its physical batch." /></Panel>;
  const logical = b.logicalOrder ?? [], physical = b.physicalMembership ?? [], inv = b.inversePermutation ?? [];
  const W = 560, X0 = 80, step = Math.min(110, (W - X0) / Math.max(1, logical.length)), short = (id) => String(id).split(".").pop();
  return (
    <Panel kind="batch" input={b.ref} footer={`layout key ${String(b.layoutKey)} · equal tensor shapes do not imply graph compatibility`}>
      <div className="lab-svgwrap">
        <svg className="lab-batch" viewBox={`0 0 ${W} 112`} role="img" aria-label={`Logical order ${logical.map(short).join(", ")} mapped to physical positions ${physical.map(short).join(", ")}`}>
          <text x={0} y={21} className="lab-batch-l">LOGICAL</text>
          <text x={0} y={99} className="lab-batch-l">PHYSICAL</text>
          {logical.map((id, i) => {
            const j = physical.indexOf(id), x1 = X0 + i * step, x2 = X0 + j * step;
            return <line key={`l${id}`} x1={x1 + step / 2 - 4} y1={28} x2={x2 + step / 2 - 4} y2={84} className={cls("lab-batch-link", i !== j && "moved")} />;
          })}
          {logical.map((id, i) => <g key={`a${id}`}><rect x={X0 + i * step} y={8} width={step - 8} height={20} className="lab-batch-cell" /><text x={X0 + i * step + 4} y={22} className="lab-batch-t">{short(id)}</text></g>)}
          {physical.map((id, i) => <g key={`b${id}`}><rect x={X0 + i * step} y={84} width={step - 8} height={20} className="lab-batch-cell" /><text x={X0 + i * step + 4} y={98} className="lab-batch-t">{short(id)}</text></g>)}
        </svg>
      </div>
      <p className="mono dim lab-batch-inv">inverse permutation [{inv.join(", ")}]</p>
    </Panel>
  );
}
