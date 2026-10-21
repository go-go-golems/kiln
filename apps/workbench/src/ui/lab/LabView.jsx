// The Lab view (guide §33): pick a lab program, see whether it built, where its data comes from, its boards (each
// opens as a dock view of its own), every hypothesis with its verdict, the plan with what it still needs and the
// hosts that can run it, and the runs it reads. Choosing a run opens it in Inspect.
import React, { useMemo, useState } from "react";
import { wb } from "../wb.js";
import { useLab, Btn, Kv, cls } from "../common.jsx";
import { Verdicts, PlanSteps } from "../Jobs.jsx";
import { labs } from "./state.js";
import { evaluateHypothesis } from "./api.js";
import { RunStamps } from "./panels.jsx";

const VERDICT = { supported: ["solid", "✓ supported"], refuted: ["bad", "✕ refuted"], open: ["", "open"], unqualified: ["bad", "unqualified"] };

export function LabView() {
  useLab("lab", "jobs", "hosts");
  const cur = labs.current;
  const groups = [...new Set(labs.programs.map((p) => p.group))];
  return (
    <div className="page col lab-home">
      <div className="scroll">
        <header className="detail-h">
          <h2>{cur ? cur.title : "Lab programs"}</h2>
          <p className="sub">{cur ? `${cur.ir ? `${cur.ir.boards.length} boards · ${cur.ir.hypotheses?.length ?? labs.hypotheses().length} hypotheses` : "did not build"} · ${labs.dataLine()}` : "Perf Lab's programs: experiments, derives, boards and hypotheses. Pick one to build it."}</p>
        </header>
        {cur?.error ? <p className="lab-err" role="alert">{cur.error}</p> : null}
        {cur?.ir ? <Boards cur={cur} /> : null}
        {cur?.ir ? <Hypotheses cur={cur} /> : null}
        {cur?.ir ? <Plan cur={cur} /> : null}
        {cur?.ir ? <Runs cur={cur} /> : null}
        {groups.map((g) => (
          <section key={g} aria-label={g}>
            <h3 className="lab-grp">{g}</h3>
            <div className="lab-progs">
              {labs.programs.filter((p) => p.group === g).map((p) => (
                <button key={p.id} type="button" className={cls(cur?.id === p.id && "on")} onClick={() => labs.open(p.id)} aria-pressed={cur?.id === p.id}>
                  <b>{p.name}</b><small>{p.description}</small><small className="mono">{p.id}.lab.js</small>
                </button>
              ))}
            </div>
          </section>
        ))}
        {cur ? <details className="lab-srcbox"><summary>Program source · {cur.id}.lab.js</summary><pre className="code">{cur.source}</pre></details> : null}
      </div>
    </div>
  );
}

function Boards({ cur }) {
  return (
    <section aria-label="Boards">
      <div className="lab-sechead"><h3>Boards</h3><Btn sm onClick={() => cur.ir.boards.forEach((b) => wb.showView(`board:${b.id}`))}>Open all</Btn></div>
      <table className="rt lab-boards">
        <thead><tr><th>board</th><th>experiments</th><th className="num">params</th><th /></tr></thead>
        <tbody>
          {cur.ir.boards.map((b) => (
            <tr key={b.id} className="clickable" onClick={() => wb.showView(`board:${b.id}`)}>
              <td><b>{b.title || b.id}</b><br /><span className="mono dim">{b.id}</span></td>
              <td className="mono">{b.experiments.join(", ") || "—"}</td>
              <td className="num">{b.paramKeys.length}</td>
              <td><button type="button" className="link" onClick={(e) => { e.stopPropagation(); wb.showView(`board:${b.id}`); }}>open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Hypotheses({ cur }) {
  const rows = useMemo(() => labs.hypotheses().map((id) => {
    try { const v = evaluateHypothesis(cur.reg, cur.state, id); return { id, verdict: v.verdict, claim: v.h.claimText, n: v.checks.length, reasons: v.reasons ?? [] }; }
    catch (e) { return { id, verdict: "open", claim: "", n: 0, reasons: [`could not evaluate: ${e.message}`] }; }
  }), [cur.reg, cur.state]);
  if (!rows.length) return null;
  return (
    <section aria-label="Hypotheses">
      <div className="lab-sechead"><h3>Hypotheses</h3></div>
      <table className="rt">
        <thead><tr><th>verdict</th><th>hypothesis</th><th className="num">rows</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><span className={cls("stamp", VERDICT[r.verdict]?.[0])} title={r.reasons.join("\n") || undefined}>{VERDICT[r.verdict]?.[1] ?? r.verdict}</span></td>
              <td><span className="mono dim">{r.id}</span><br />{r.claim}</td>
              <td className="num">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const CAPTURE = { cached: "solid", execute: "", import: "", blocked: "bad" };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Whether a capture can run as a job: its host is one of the server's and its workload has a Kiln workload kind. */
const runnable = (c) => c.host in labs.reports && c.lowered?.workload?.adapter === "sampler";

/**
 * The plan: every capture with its cache status, host, repetitions and lowered spec, the jobs that run the missing
 * ones (on the hosts they name), a dry run of them, and the jobs this page submitted that have not finished.
 */
function Plan({ cur }) {
  const [open, setOpen] = useState(null);
  const plan = cur.ir.plan, missing = labs.missing(), real = missing.filter(runnable), other = missing.length - real.length;
  const hosts = [...new Set(real.map((c) => c.host))];
  const live = wb.jobs.filter((j) => labs.jobs.has(j.id) && !["done", "failed", "cancelled"].includes(j.status));
  return (
    <section aria-label="Plan">
      <div className="lab-sechead">
        <h3>Plan</h3>
        <span className="dim">{plan.cached} cached · {plan.execute} to run{plan.import ? ` · ${plan.import} to import` : ""} · {plan.blocked} blocked{cur.pending ? ` · pending: ${plural(cur.pending.captures.length, "capture")}` : ""}</span>
        <span className="sp" />
        {real.length ? (
          <>
            <Btn sm primary onClick={() => void labs.runPlan(real)} title={`One approved job per host and repetition count on ${hosts.join(", ")}`}>Run {plural(real.length, "capture")} on {hosts.join(", ")}</Btn>
            <Btn sm onClick={() => void labs.runPlan(real, { dryRun: true })} title="Plan the jobs on the server without running or storing anything">Dry run</Btn>
          </>
        ) : null}
      </div>
      {other ? <p className="note">{plural(other, "capture")} name a synthetic host or a workload no Kiln host runs; the boards show generated runs for them.</p> : null}
      {live.length ? <p className="note" role="status">Running: {live.map((j) => `${j.id.slice(4, 12)} on ${j.host} (${j.status}, ${Math.round((j.progress ?? 0) * 100)} %)`).join(" · ")}. The boards rebuild when the runs arrive.</p> : null}
      <div className="lab-table">
        <table className="rt lab-plan">
          <thead><tr><th>status</th><th>capture</th><th>host</th><th className="num">processes</th><th>lab hash</th><th className="num">estimate</th></tr></thead>
          <tbody>
            {plan.captures.map((c) => (
              <React.Fragment key={c.id}>
                <tr className="clickable" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                  <td><span className={cls("stamp", CAPTURE[c.status])} title={c.blockedOn}>{c.status}</span></td>
                  <td className="mono">{c.ref}</td>
                  <td className="mono">{c.host}{c.host in labs.reports ? "" : <span className="dim"> · synthetic</span>}</td>
                  <td className="num">{c.reps}</td>
                  <td className="mono dim">{c.hash.slice(0, 10)}</td>
                  <td className="num">{c.estimateGpuMin} min</td>
                </tr>
                {open === c.id ? <tr><td colSpan={6}><pre className="code lab-spec">{JSON.stringify(c.lowered, null, 2)}</pre></td></tr> : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {cur.dryRun ? <LabDryRun d={cur.dryRun} /> : null}
      {cur.ir.experiments.some((e) => e.limitations?.length) ? (
        <div className="note"><b>Limitations</b><ul>{cur.ir.experiments.flatMap((e) => (e.limitations ?? []).map((l) => <li key={`${e.id}${l}`}>{e.id}: {l}</li>))}</ul></div>
      ) : null}
    </section>
  );
}

function LabDryRun({ d }) {
  return (
    <div className="block lab-dry">
      <header><h3>Dry run</h3><span className="sp" /><Btn sm onClick={() => { labs.current.dryRun = null; wb.bump("lab"); }}>Close</Btn></header>
      {d.results.map((r, i) => (
        <div key={i}>
          <p className="note">{r.host ? `${r.host}: ` : ""}{plural(r.verdicts.filter((v) => v.verdict === "execute").length, "capture")} to run in {plural(r.groups, "group")}, {plural(r.steps, "step")}. Nothing was stored.</p>
          <Verdicts verdicts={r.verdicts} />
          {r.plan ? <PlanSteps plan={r.plan} /> : null}
        </div>
      ))}
    </div>
  );
}

/** The hosts the program's experiments name, each with its report: real (probed by the Kiln server) or synthetic. */
function HostReports({ cur }) {
  const hosts = [...new Set(cur.ir.experiments.map((e) => e.host))];
  return (
    <div className="lab-hosts">
      {hosts.map((h) => {
        const r = labs.reports[h];
        return (
          <div key={h} className="block">
            <header><h3 className="mono">capabilities@{h}</h3><span className={cls("stamp", r && "solid")}>{r ? "probed" : "synthetic"}</span></header>
            {r ? (
              <Kv rows={[
                ["cpu", `${r.cpu.name} · ${r.cpu.cores} cores · ${r.arch}`],
                ["gpu", r.gpu.count ? `${r.gpu.count} × ${r.gpu.name}` : "none"],
                ["tools", Object.entries(r.tools).map(([k, v]) => `${k} ${v}`).join(" · ")],
                ["counters", r.counters.unsupported.length ? `unavailable: ${r.counters.reason ?? r.counters.unsupported.join(", ")}` : "readable"],
              ]} />
            ) : <p className="note">No Kiln host has this name; its runs are generated from each capture's hash and say so.</p>}
          </div>
        );
      })}
    </div>
  );
}

/** The runs the program reads, by experiment: measured or synthetic, valid or not. Choosing one opens it in Inspect. */
function Runs({ cur }) {
  const runs = cur.reg.source.runs("*/*/*");
  const byExp = new Map();
  for (const r of runs) byExp.set(String(r.experiment), [...(byExp.get(String(r.experiment)) ?? []), r]);
  const choose = (ref) => { labs.select(ref); wb.showView("inspect"); };
  return (
    <section aria-label="Runs">
      <div className="lab-sechead"><h3>Runs</h3><span className="dim">{plural(runs.length, "run")} · {runs.filter((r) => r.synthetic === false).length} measured · {runs.filter((r) => !r.validity?.ok).length} invalid</span></div>
      <HostReports cur={cur} />
      {[...byExp.entries()].map(([exp, list]) => (
        <div key={exp} className="lpanel flush">
          <header><h3 className="mono">{exp}</h3><span className="lp-kind">{plural(list.length, "run")}</span></header>
          <ul className="lab-runs">
            {list.map((r) => (
              <li key={r.ref}>
                <button type="button" className={cls(cur.selected === r.ref && "sel")} onClick={() => choose(r.ref)}>
                  <span className="mono lab-ref">{r.ref.replace(`${exp}/`, "")}</span>
                  <span className="mono dim lab-act">{r.manifest?.host ?? ""}{r.startedAt ? ` · ${String(r.startedAt).slice(0, 19).replace("T", " ")}` : ""}</span>
                  <RunStamps run={r} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!runs.length ? <p className="note">No runs: nothing in the plan is cached yet.</p> : null}
    </section>
  );
}
