import React, { useEffect, useRef, useState } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Tog, Kv, Empty, cls } from "./common.jsx";
import { fmtUs } from "@kiln/kiln/core/util.js";
import { CODEGEN_VERSION } from "@kiln/kiln/std/records.js";
import { EVIDENCE_FORMAT } from "@kiln/kiln/std/store.js";
import { saveText } from "./Kernels.jsx";
import { Val, StatusStamp, evidenceVal, recordVal, statusWhy, methodOf, median, shortId, Row, paramsText } from "./marks.jsx";

const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const Id = ({ id, n = 12 }) => <span className="mono" title={id}>{shortId(id, n)}</span>;

// ----------------------------------------------------------------------------- Evidence (guide §32.6)
// Every kiln-measure/1 record, grouped by kernel × schedule row × device. A group's head shows what the compiler
// decides with (the pooled statistics of its decisive records); each record shows its own median and status.
export function EvidenceView() {
  useLab("store", "compile", "device", "sel", "measure");
  const [mine, setMine] = useState(true);
  const [here, setHere] = useState(true);
  const [armed, setArmed] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  const dev = wb.evidenceId;
  const ids = new Set(wb.prog?.kernels.map((k) => k.identity) || []);
  const recs = wb.store.list(here ? { device: dev } : {}).filter((r) => !mine || ids.has(r.kernel.identity));
  const groups = new Map();
  for (const r of recs) {
    const key = `${r.kernel.identity}|${r.kernel.row}|${r.device.id}`;
    if (!groups.has(key)) groups.set(key, { key, name: r.kernel.name, identity: r.kernel.identity, row: r.kernel.row, knobs: r.kernel.knobs, device: r.device, recs: [] });
    groups.get(key).recs.push(r);
  }
  const inUse = (g) => g.device.id === dev && !!wb.prog?.kernels.some((k) => k.identity === g.identity && k.row === g.row);
  // by kernel; within a kernel the schedule in use first, then by device and row
  const gs = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || inUse(b) - inUse(a) || a.device.name.localeCompare(b.device.name) || a.row.localeCompare(b.row));
  const sel = wb.store.records.get(wb.sel.record) || gs[0]?.recs[0] || null;
  const nDev = wb.store.list({ device: dev }).length;

  const importEv = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    let json;
    try { json = JSON.parse(await f.text()); } catch (err) { wb.toast("Not a JSON file: " + err.message, "bad"); return; }
    try {
      const r = wb.store.import(json);
      const total = (json.records || json.rows || []).length, dup = total - r.added - r.skipped;
      wb.toast(`Imported ${plural(r.added, "record")}${dup > 0 ? `, ${dup} already stored` : ""}${r.skipped ? `, skipped ${r.skipped}${r.errors[0] ? ` (${r.errors[0]})` : ""}` : ""}`, r.skipped && !r.added ? "bad" : "");
      wb.log("measure", `imported evidence: ${r.added} added, ${r.skipped} skipped (${json.format || "kiln-evidence/1"})`, { bad: r.skipped > 0 });
      wb.compile();
    } catch (err) { wb.toast("Could not import: " + err.message, "bad"); }
  };
  const forget = (filter) => {
    const n = filter ? wb.store.list(filter).length : wb.store.size;
    const devices = filter ? [filter.device] : [...new Set(wb.store.list().map((r) => r.device.id))];
    wb.store.forget(filter || {});
    wb.forgetOnServer(devices);
    setArmed(false);
    wb.toast(`Forgot ${plural(n, "record")}${wb.server ? " here and on the server" : ""}`);
    wb.compile();
  };

  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <Tog on={mine} onClick={() => setMine(!mine)} title="Only the kernels of the compiled program">This program</Tog>
          <Tog on={here} onClick={() => setHere(!here)} title={`Only records from ${dev}`}>This device</Tog>
          <span className="lbl">{plural(recs.length, "record")} · {plural(gs.length, "group")}</span>
          <span className="sp" />
          <Btn sm onClick={() => fileRef.current?.click()} title={`Add records from a ${EVIDENCE_FORMAT} export, or rows from kiln-evidence/1 (they become legacy records)`}>Import…</Btn>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importEv} />
          <Btn sm onClick={() => saveText("kiln-evidence.json", JSON.stringify(wb.store.toJSON(), null, 1))} disabled={!wb.store.size} title={`Every record, as ${EVIDENCE_FORMAT}`}>Export</Btn>
          <Btn sm danger onClick={() => forget({ device: dev })} disabled={!nDev} title={`Forget the ${plural(nDev, "record")} of ${dev}`}>Forget this device</Btn>
          <Btn sm danger onClick={() => (armed ? forget(null) : setArmed(true))} disabled={!wb.store.size}>{armed ? `Forget all ${wb.store.size}?` : "Forget all"}</Btn>
        </div>
        <div className="scroll">
          {gs.length ? (
            <div className="xscroll">
              <table className="rt evt">
                <thead><tr><th>measured</th><th className="by">by</th><th>timing</th><th className="num">time</th><th>status</th></tr></thead>
                {gs.map((g) => {
                  const pooled = evidenceVal(g.device.id, g.identity, g.knobs, { src: g.device.class === "sim" ? "simulated" : "measured", name: g.device.name });
                  // one group is one kernel identity, which the parameters are hashed into: any record's context speaks for all
                  const params = paramsText(g.recs.find((r) => r.context?.params)?.context);
                  return (
                    <tbody key={g.key}>
                      <tr className="grp clickable" onClick={() => wb.select({ record: g.recs[0].id, kernel: g.name })}>
                        <td colSpan={3}><b>{g.name}</b> <span className="rowtxt"><Row row={g.row} /></span>{params ? <span className="rowtxt dim"> · {params}</span> : null} <span className="dim">· {g.device.name}</span>{inUse(g) ? <span className="tag">in use</span> : null}</td>
                        <td className="num" title="what the compiler decides with: the pooled decisive records of this option">{pooled.state === "missing" ? <span className="dim" title={pooled.title}>not decisive</span> : <Val v={pooled} />}</td>
                        <td className="dim">{plural(g.recs.length, "record")}</td>
                      </tr>
                      {g.recs.map((r) => (
                        <tr key={r.id} className={cls("clickable", sel === r && "sel")} onClick={() => wb.select({ record: r.id, kernel: r.kernel.name })}>
                          <td className="at">{when(r.at)}</td><td className="by">{r.by}</td>
                          <td>{r.timing.kind}{r.timing.launches ? <span className="dim"> ×{r.timing.launches}</span> : null}</td>
                          <td className="num"><Val v={recordVal(r)} /></td>
                          <td><StatusStamp rec={r} /></td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </div>
          ) : <Empty>{wb.store.size ? `No records ${mine ? "for this program's kernels " : ""}${here ? `on ${dev}` : ""}. Turn the filters off to see the other ${plural(wb.store.size, "record")}.` : "No records yet. Measure (Perf) or Tune to make some, or import an export."}</Empty>}
          <div className="titleblock">
            <div><label>project</label><b>{wb.preset ? `${wb.preset.id} ${wb.preset.title}` : "—"}</b></div>
            <div><label>device</label><b title={dev}>{wb.device.label} · {dev}</b></div>
            <div><label>records</label><b>{recs.length} shown · {wb.store.size} stored</b></div>
            <div><label>format</label><b>{EVIDENCE_FORMAT}</b></div>
            <div><label>code generator</label><b>{CODEGEN_VERSION}</b></div>
          </div>
        </div>
      </div>
      <aside className="side">
        {sel ? <RecordDetail r={sel} /> : <div className="block"><p className="note">A record is one kernel measured on one device: every repetition's time, the output check, whether the schedule asked for is the one that ran, the protocol, and the ids that tie it to the code. Only fresh, valid, complete records decide schedules.</p></div>}
      </aside>
    </div>
  );
}

function RecordDetail({ r }) {
  const st = wb.store.status(r), k = r.kernel, t = r.timing, c = r.check, a = r.activation, p = r.protocol;
  const stats = wb.store.statsFor(r.device.id, k.identity, k.knobs);
  const pooled = stats?.records.includes(r) ? stats : null;
  return (
    <>
      <div className={cls("block", st === "stale" && "stale")}>
        <header><h2>{k.name}</h2><span className="sub">{k.row}</span></header>
        <p className="recline"><StatusStamp rec={r} /> <span className="dim">{r.device.name} · {when(r.at)} · by {r.by}</span></p>
        <Strip r={r} band={pooled} />
      </div>
      <div className="block">
        <header><h2>Program</h2><span className="sub">the settings it was compiled from</span></header>
        {r.context ? (
          <Kv rows={[
            r.context.preset ? ["preset", r.context.preset] : null, r.context.project ? ["project", r.context.project] : null,
            ...Object.entries(r.context.params || {}).map(([key, v]) => [key, String(v)]),
            r.context.script ? ["script sha256", <Id id={r.context.script} />] : null,
          ]} />
        ) : <p className="note">Not recorded: this record predates record contexts, or its producer did not send one. The kernel identity and content id still name exactly what ran.</p>}
      </div>
      <div className="block">
        <header><h2>Validity</h2></header>
        {r.validity.reasons.length ? <ul className="reasons bad">{r.validity.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
        {r.validity.partial.length ? <ul className="reasons">{r.validity.partial.map((x, i) => <li key={i}>partial: {x}</li>)}</ul> : null}
        {st === "stale" ? <ul className="reasons"><li>{statusWhy(r)}</li></ul> : null}
        {st === "fresh" ? <p className="note">✓ valid, complete and current: this record can decide schedules.</p> : null}
      </div>
      <div className="block">
        <header><h2>Activation</h2><span className="sub">the schedule asked for, and the one that ran</span></header>
        <Kv rows={[["requested", a.requested ? <Row row={a.requested} /> : "— (no fork)"], ["materialised", <Row row={a.materialized} />], ["matches", a.ok ? "✓ yes" : "✕ no", !a.ok]]} />
        {a.notes.length ? <p className="note">{a.notes.join("; ")}</p> : null}
      </div>
      <div className="block">
        <header><h2>Check</h2><span className="sub">sampled outputs against the Loop IR reference</span></header>
        <Kv rows={[["passed", c.ok ? "✓ yes" : "✕ no", !c.ok], ["sampled outputs", c.sampled], c.maxAbsErr != null ? ["max |error|", c.maxAbsErr.toExponential(2)] : null]} />
        {c.detail ? <p className="note">{c.detail}</p> : null}
      </div>
      <div className="block">
        <header><h2>Protocol</h2></header>
        <Kv rows={[
          ["repetitions", `${t.samples.length} of ${p.reps}`, t.samples.length !== p.reps], ["timing", t.kind], t.launches ? ["launches per repetition", t.launches] : null,
          t.warmup != null ? ["warm-up launches", t.warmup] : null, ["seed", p.seed], p.order ? ["kernel order", p.order.join(" ")] : null,
          p.position ? ["position per repetition", p.position.join(" ")] : null, p.pairId ? ["pair", <Id id={p.pairId} />] : null,
          t.samples.length ? ["median", fmtUs(median(t.samples))] : null, t.samples.length > 1 ? ["range", `${fmtUs(Math.min(...t.samples))} – ${fmtUs(Math.max(...t.samples))}`] : null,
        ]} />
      </div>
      {r.counts ? (
        <div className="block">
          <header><h2>Counts</h2><span className="sub"><i className={cls("prov", r.countsProv)} title={r.countsProv === "derived" && r.counts.sampledBlocks ? `derived: SIMT simulation of ${r.counts.sampledBlocks} sampled blocks, scaled ×${+(r.counts.blocks / r.counts.sampledBlocks).toPrecision(3)} to the grid` : "observed: ncu --metrics"} /> {r.countsProv}</span></header>
          <Kv rows={Object.entries(r.counts).map(([key, v]) => [key, Number.isInteger(v) ? v.toLocaleString() : +v.toPrecision(4)])} />
        </div>
      ) : null}
      <div className="block">
        <header><h2>Manifest</h2></header>
        <Kv rows={[["code generator", r.manifest.codegen, r.manifest.codegen !== CODEGEN_VERSION], ["app", r.manifest.app], r.manifest.runner ? ["runner", r.manifest.runner] : null, r.manifest.userAgent ? ["browser", <span title={r.manifest.userAgent}>{r.manifest.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] || "see title"}</span>] : null]} />
      </div>
      <div className="block">
        <header><h2>Ids</h2><span className="sub">hover for the full value</span></header>
        <Kv rows={[
          ["record", <Id id={r.id} />], ["content", k.contentId ? <Id id={k.contentId} /> : "— (legacy)"], ["source sha256", k.sourceSha256 ? <Id id={k.sourceSha256} /> : "—"], ["language", k.lang],
          ["kernel identity", <Id id={k.identity} />], ["launch", `${k.launch.grid} × ${k.launch.block}${k.launch.smem ? `, ${k.launch.smem} B smem` : ""}`],
          ["device", <span title={r.device.id}>{r.device.id}</span>], ...Object.entries(r.device.fingerprint).map(([key, v]) => [`fingerprint ${key}`, <span title={String(v)}>{String(v).length > 24 ? String(v).slice(0, 24) + "…" : String(v)}</span>]),
        ]} />
      </div>
    </>
  );
}

// One dot per repetition on a time axis, the record's median as a line, the option's pooled CI as a band.
// Repetitions far from the median (beyond 8 median absolute deviations) would squeeze the rest into a few pixels,
// so they sit at the edge as an arrow with their count and value instead.
function Strip({ r, band }) {
  const xs = r.timing.samples;
  if (!xs.length) return <p className="note">No completed repetitions.</p>;
  const W = 260, H = 64, L = 10, R = 10, base = 46;
  const med = median(xs), mad = median(xs.map((v) => Math.abs(v - med))) || med * 0.005;
  const far = (v) => Math.abs(v - med) > 8 * mad;
  const near = xs.filter((v) => !far(v)), hiOut = xs.filter((v) => far(v) && v > med), loOut = xs.filter((v) => far(v) && v < med);
  const inBand = band && band.hi > band.lo && !far(band.lo) && !far(band.hi) ? band : null;
  let lo = Math.min(...near, inBand?.lo ?? Infinity), hi = Math.max(...near, inBand?.hi ?? -Infinity);
  if (hi - lo < lo * 0.02) { const m = (lo + hi) / 2 || 1; lo = m * 0.98; hi = m * 1.02; }
  const pad = (hi - lo) * 0.08, x0 = lo - pad, x1 = hi + pad;
  const X = (v) => L + ((Math.min(x1, Math.max(x0, v)) - x0) / (x1 - x0)) * (W - L - R);
  const sim = r.timing.kind === "simulated", why = wb.store.status(r) === "fresh" ? "" : "; no band: this record does not decide";
  return (
    <>
    <svg className="strip" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${xs.length} repetitions, median ${fmtUs(med)}`}>
      {inBand ? <rect className="ciband" x={X(inBand.lo)} y={8} width={Math.max(1, X(inBand.hi) - X(inBand.lo))} height={base - 8}><title>{`95 % CI of the option's median: ${fmtUs(inBand.lo)} – ${fmtUs(inBand.hi)}`}</title></rect> : null}
      <line className="axis" x1={L} x2={W - R} y1={base} y2={base} />
      <line className="medl" x1={X(med)} x2={X(med)} y1={6} y2={base}><title>{`median ${fmtUs(med)}`}</title></line>
      <g className={cls("ser", sim ? "sim" : "hw")}>
        {xs.map((v, i) => (far(v) ? null : <circle key={i} className="mk" cx={X(v)} cy={18 + (i % 5) * 6} r={3}><title>{`repetition ${i + 1}: ${fmtUs(v)}`}</title></circle>))}
      </g>
      {hiOut.length ? <g className="out"><path d={`M${W - R - 6},4 L${W - 2},9 L${W - R - 6},14 Z`} /><title>{`${hiOut.length} repetition${hiOut.length === 1 ? "" : "s"} beyond the axis: ${hiOut.map(fmtUs).join(", ")}`}</title><text className="ax" x={W - R - 8} y={12} textAnchor="end">{hiOut.length === 1 ? `1 at ${fmtUs(hiOut[0])}` : `${hiOut.length} up to ${fmtUs(Math.max(...hiOut))}`}</text></g> : null}
      {loOut.length ? <g className="out"><path d={`M${L + 6},4 L${2},9 L${L + 6},14 Z`} /><title>{`${loOut.length} repetition${loOut.length === 1 ? "" : "s"} below the axis: ${loOut.map(fmtUs).join(", ")}`}</title><text className="ax" x={L + 8} y={12}>{loOut.length === 1 ? `1 at ${fmtUs(loOut[0])}` : `${loOut.length} down to ${fmtUs(Math.min(...loOut))}`}</text></g> : null}
      <text className="ax" x={L} y={H - 4}>{fmtUs(x0 + pad)}</text>
      <text className="ax" x={W - R} y={H - 4} textAnchor="end">{fmtUs(x1 - pad)}</text>
    </svg>
    <p className="note">{methodOf(r)}{inBand ? `; band: 95 % CI of the option's median over ${plural(band.records.length, "decisive record")}` : band && band.hi > band.lo ? "; the option's 95 % CI reaches past the axis, so no band" : why}</p>
    </>
  );
}
