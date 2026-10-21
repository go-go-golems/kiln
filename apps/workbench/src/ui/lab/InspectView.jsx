// Inspect (guide §33), Perf Lab's Inspector as a dock view: the lab entity selected on any board or in the Lab view's
// runs, with its fields, its run's manifest, its counters and every recorded relationship grouped by relation, each
// with the evidence class that produced it. Temporal overlap alone never creates a relationship, so an entity with
// none says so instead of guessing one.
import React from "react";
import { wb } from "../wb.js";
import { useLab, Btn, Kv } from "../common.jsx";
import { labs } from "./state.js";
import { isValue } from "./api.js";
import { manifestRows, RunStamps, SourceRef } from "./panels.jsx";
import { MetricsTable } from "./inspect.jsx";

const SKIP = new Set(["kind", "id", "ref", "run", "metrics", "metric", "manifest", "validity", "activation", "coverage", "quality", "logicalOrder", "physicalMembership", "inversePermutation"]);
const LINKS_SHOWN = 24;

const fieldText = (v) => (Array.isArray(v) ? `[${v.join(", ")}]` : isValue(v) ? (v.value == null ? `— (${v.reason ?? "missing"})` : `${v.value}${v.unit ? ` ${v.unit}` : ""}`) : v == null ? "—" : String(v));

function Relations({ reg, links, dir }) {
  const byRel = new Map();
  for (const l of links) byRel.set(l.rel, [...(byRel.get(l.rel) ?? []), l]);
  return [...byRel.entries()].map(([rel, ls]) => (
    <div key={`${dir}${rel}`} className="insp-rel">
      <div className="mono">{dir === "fwd" ? "→" : "←"} {rel} <span className="dim">· {ls[0].evidence}{ls[0].method ? ` · ${ls[0].method}` : ""}</span></div>
      <div className="insp-chips">
        {ls.slice(0, LINKS_SHOWN).map((l) => {
          const ref = dir === "fwd" ? l.to : l.from, t = reg.source.entity(ref);
          return <button key={ref} type="button" className="chip mono" title={`${ref} · ${l.evidence}`} onClick={() => labs.select(ref)}>{String(t?.name ?? t?.id ?? ref.split("!").pop())}</button>;
        })}
        {ls.length > LINKS_SHOWN ? <span className="dim mono">+{ls.length - LINKS_SHOWN} more</span> : null}
      </div>
    </div>
  ));
}

export function InspectView() {
  useLab("lab");
  const cur = labs.current, sel = cur?.selected ?? null, reg = cur?.reg;
  const e = sel && reg ? reg.source.entity(sel) : undefined;
  const empty = (title, hint) => <div className="page"><div className="lab-empty padded"><b>{title}</b><span>{hint}</span></div></div>;
  if (!cur) return empty("No lab program is open", "Open one from the Lab view.");
  if (!sel) return empty("Nothing selected", "Select a row, a timeline event or a run; it appears here with its evidence.");
  if (!e) return empty("Not in this build", `${sel} is not part of any run of the current build.`);
  const fields = Object.entries(e).filter(([k, v]) => !SKIP.has(k) && typeof v !== "function" && (v === null || typeof v !== "object" || isValue(v) || Array.isArray(v)));
  const out = reg.source.links(e.ref, null, "fwd"), inn = reg.source.links(e.ref, null, "back");
  const run = e.kind === "run" ? e : e.run ? reg.source.entity(String(e.run)) : null;
  return (
    <div className="page col">
      <div className="scroll insp">
        <header className="detail-h">
          <h2><span className="stamp solid">{e.kind}</span> {String(e.name ?? e.id)}</h2>
          <p className="sub mono">{e.ref}</p>
          <span className="sp" />
          <Btn sm onClick={() => { void navigator.clipboard?.writeText(e.ref); wb.toast(`Copied ${e.ref}`); }}>Copy reference</Btn>
          <Btn sm onClick={() => labs.select(null)}>Clear</Btn>
        </header>
        {e.kind === "run" ? null : (
          <section aria-label="Fields">
            {run ? <p className="note">run <button type="button" className="link mono" onClick={() => labs.select(run.ref)}>{run.ref}</button></p> : null}
            <Kv rows={fields.map(([k, v]) => [k, <span className="mono">{fieldText(v)}</span>])} />
          </section>
        )}
        {e.kind === "code" ? <p className="note">source {e.source ? <SourceRef refText={String(e.source)} /> : <span className="dim">{String(e.sourceReason ?? "unavailable")}</span>}</p> : null}
        {e.metrics ? <section aria-label="Counters"><h3>Counters</h3><MetricsTable entity={e} names={Object.keys(e.metrics)} /></section> : null}
        {out.length || inn.length ? (
          <section aria-label="Relationships">
            <h3>Relationships</h3>
            <Relations reg={reg} links={out} dir="fwd" />
            <Relations reg={reg} links={inn} dir="back" />
          </section>
        ) : <p className="note">No recorded relationships. Temporal overlap alone never creates one.</p>}
        {run ? (
          <section aria-label="Run manifest">
            <h3>Run {e.kind === "run" ? "" : <span className="mono dim">{run.ref}</span>}</h3>
            <RunStamps run={run} />
            <Kv rows={manifestRows(run)} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
