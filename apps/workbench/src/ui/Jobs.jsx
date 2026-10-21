import React, { useEffect } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Kv, Empty, cls } from "./common.jsx";
import { Val, StatusStamp, recordVal, shortId } from "./marks.jsx";

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const when = (iso) => { const d = iso ? new Date(iso) : null; return !d || isNaN(d) ? "—" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
const clock = (iso) => { const d = iso ? new Date(iso) : null; return !d || isNaN(d) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); };
const secs = (s) => (s == null || !isFinite(s) ? "—" : s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`);
const jobId = (id) => id.replace(/^job-/, "").slice(0, 8);
const protocolText = (p) => `${p.reps} × ${p.launches} launches`;
const kindsOf = (caps) => [...new Set(caps.map((c) => c.kind))].join(", ");

// ----------------------------------------------------------------------------- Jobs (guide §24, §30.4)
// Jobs on the Kiln server's hosts, newest first. A job is a list of captures on one host; the server plans it into
// steps, the host's driver runs them, and the server imports the result archive into runs and records. A job's status
// is a word in a stamp: solid once it ran to the end, red when it failed, dashed while it waits, runs or imports.
// Measure on a host proposes and approves one; an agent's job waits here for Approve. Dry run plans the current
// program on a host without storing anything. The side panel follows the selected job: its captures' verdicts, its
// plan, its events, its archive and its records.
const STATUS = {
  proposed: "proposed: waits for the user to approve it",
  approved: "approved: queued for its host",
  running: "running on its host",
  importing: "importing: the server reads the job's result archive",
  done: "done: every repetition ran and was imported",
  failed: "failed: stopped with an error; its partial runs and records are kept, invalid",
  cancelled: "cancelled: its partial runs and records are kept, invalid",
};
export function JobStamp({ status }) {
  return <span className={cls("stamp", status === "done" && "solid", status === "failed" && "bad")} title={STATUS[status]}>{status}</span>;
}

const canApprove = (j) => j.status === "proposed";
const canCancel = (j) => j.status === "proposed" || j.status === "approved" || j.status === "running";
const canReimport = (j) => j.archive && (j.status === "done" || j.status === "failed" || j.status === "cancelled");
function Actions({ j, detail = false }) {
  const act = (action) => (e) => { e.stopPropagation(); wb.jobAction(j.id, action); };
  return (
    <>
      {canApprove(j) ? <Btn sm primary onClick={act("approve")} title="Run this job on its host">Approve</Btn> : null}
      {canCancel(j) ? <Btn sm onClick={act("cancel")} title={j.status === "running" ? "Stop the driver; the repetitions done so far become invalid records" : "Withdraw the job before it runs"}>Cancel</Btn> : null}
      {detail && canReimport(j) ? <Btn sm onClick={act("reimport")} title="Import the stored result archive again: the same runs and records, made by the current importers">Reimport</Btn> : null}
    </>
  );
}

export function JobsView() {
  useLab("jobs", "server", "sel", "store", "device");
  const jobs = wb.jobs, hosts = wb.hosts;
  const sel = jobs.find((j) => j.id === wb.sel.job) || jobs[0] || null;
  // the list carries no events: read the selected job in full once
  useEffect(() => { if (sel && !sel.events) wb.openJob(sel.id); }, [sel?.id, !sel?.events]);
  if (!wb.server) {
    return (
      <div className="page col">
        <Empty>Not served by the Kiln server, so there are no jobs. Jobs run captures on the server's hosts: start it with <code>pnpm serve</code> (<code>pnpm dev</code> builds the page first) and open the address it prints.</Empty>
      </div>
    );
  }
  const counts = ["proposed", "approved", "running", "importing", "done", "failed", "cancelled"].map((s) => [s, jobs.filter((j) => j.status === s).length]).filter(([, n]) => n);
  const dev = wb.device?.server ? wb.device : null;
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <span className="lbl">{plural(jobs.length, "job")}{counts.map(([s, n]) => ` · ${n} ${s}`).join("")}</span>
          <span className="sp" />
          <Btn sm onClick={() => wb.dryRunJob(dev)} disabled={!dev || !wb.prog} title={dev ? `Plan this program's kernels on ${dev.host} without running or storing anything` : "Pick a host device (Perf or Devices) to dry-run on"}>Dry run{dev ? ` on ${dev.host}` : ""}</Btn>
          <Btn sm onClick={() => wb.serverReread()} title="Read the jobs, hosts and records again">Refresh</Btn>
        </div>
        <div className="scroll">
          {!hosts.length ? <Empty>The server has no hosts, so it cannot run jobs. Add one to <code>hosts.json</code> in its data directory (see <code>apps/server/README.md</code>), start that host's driver, and restart the server.</Empty> : null}
          {jobs.length ? (
            <div className="xscroll">
              <table className="rt evt jobt">
                <thead><tr><th>status</th><th>job</th><th>captures</th><th className="at">times</th><th className="num" title="seconds the host's driver spent running the job's steps">host time</th><th /></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className={cls("clickable", sel === j && "sel")} tabIndex={0} onClick={() => wb.openJob(j.id)} onKeyDown={(e) => { if (e.key === "Enter") wb.openJob(j.id); }}>
                      <td><JobStamp status={j.status} /></td>
                      <td className="jwhat"><span>{j.reason}</span><small>by the {j.proposedBy} · {j.host} · <span className="mono">{jobId(j.id)}</span></small></td>
                      <td>{plural(j.captures.length, "capture")}<small>{kindsOf(j.captures)}</small><small>{protocolText(j.protocol)}</small></td>
                      <td className="at"><small>created {clock(j.createdAt)}</small><small>started {clock(j.startedAt)}</small><small>finished {clock(j.finishedAt)}</small></td>
                      <td className="num">{secs(j.executorSeconds)}</td>
                      <td className="acts"><Actions j={j} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : hosts.length ? <Empty>No jobs yet. Pick a host device in Perf or Devices and Measure: the page proposes the program's kernels as a job on that host and approves it.</Empty> : null}
          <div className="titleblock">
            <div><label>server</label><b>{wb.serverInfo.state}{wb.serverInfo.version ? ` · ${wb.serverInfo.version}` : ""}</b></div>
            <div><label>hosts</label><b>{hosts.length ? hosts.map((h) => h.id).join(", ") : "none"}</b></div>
            <div><label>jobs</label><b>{jobs.length} shown · newest first</b></div>
          </div>
        </div>
      </div>
      <aside className="side">
        {wb.dryRun ? <DryRun d={wb.dryRun} /> : null}
        {sel ? <JobDetail j={sel} /> : wb.dryRun ? null : <div className="block"><p className="note">A job runs captures on one host under a protocol: repetitions, each a fresh process per group of captures in a seeded shuffled order. The server plans it into steps, the host's driver runs them, and every capture becomes runs, plus a record when its kind makes one.</p></div>}
      </aside>
    </div>
  );
}

const VERDICT = {
  execute: "runs in this job",
  cached: "the server already has runs of this capture; it is not run again",
  blocked: "the host cannot run it",
};
/** The planner's verdict on each capture the job asked for (and the companions it added). */
function Verdicts({ verdicts }) {
  if (!verdicts?.length) return null;
  return (
    <div className="xscroll">
      <table className="rt jcap">
        <thead><tr><th>capture</th><th>kind · mode</th><th>verdict</th></tr></thead>
        <tbody>
          {verdicts.map((v, i) => (
            <tr key={i}>
              <td><span className="strong">{v.label}</span>{v.capture ? <small className="mono" title={v.capture}>{shortId(v.capture)}</small> : null}</td>
              <td>{v.kind}<small>{v.mode}{v.collectors?.length ? ` · ${v.collectors.join(", ")}` : ""}</small></td>
              <td><span className={cls("stamp", v.verdict === "execute" && "solid", v.verdict === "blocked" && "bad")} title={VERDICT[v.verdict]}>{v.verdict}</span>{v.reason ? <small>{v.reason}</small> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A kiln-plan/1's steps: what the driver runs, in order, and which capture repetitions each serves. */
function PlanSteps({ plan }) {
  if (!plan) return <p className="note">reading…</p>;
  const envs = Object.entries(plan.environments);
  return (
    <>
      <Kv rows={[
        ["environments", envs.map(([n, e]) => `${n} · ${e.ref}`).join("; ") || "—"],
        ["GPU", plan.gpu ? `index ${plan.gpu.index}` : "none"],
        ["staged files", `${plan.files.length}`],
        plan.lock ? ["GPU lock", `waits up to ${plan.lock.waitSeconds} s`] : null,
      ]} />
      <ol className="jsteps">
        {plan.steps.map((s) => (
          <li key={s.id}>
            <div className="hd"><span className="mono strong">{s.id}</span><span className="dim">{s.environment}{s.user === "root" ? " · root" : ""} · {s.timeoutSeconds} s limit</span></div>
            <code className="argv">{[...s.wrap, ...s.argv].join(" ")}</code>
            <div className="dim">
              serves {s.serves.map((x) => `${shortId(x.capture)} r${x.rep}`).join(", ")}
              {s.collectors.length ? ` · collectors ${s.collectors.join(", ")}` : ""}
              {s.sidecars.length ? ` · sidecars ${s.sidecars.join(", ")}` : ""}
              {s.post ? " · an export process after it" : ""}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

/** The last dry run: what the server would do with this program on that host, stored nowhere. */
function DryRun({ d }) {
  const r = d.result, run = r ? r.verdicts.filter((v) => v.verdict === "execute").length : 0, other = r ? r.verdicts.length - run : 0;
  return (
    <div className="block">
      <header><h2>Dry run · {d.host}</h2><span className="sub">{clock(d.at)}</span><span className="sp" /><Btn sm onClick={() => wb.closeDryRun()}>Close</Btn></header>
      {d.error ? <p className="note bad">{d.error}</p> : !r ? <p className="note">planning…</p> : (
        <>
          <p className="note">{plural(run, "capture")} to run in {plural(r.groups, "group")}, {plural(r.steps, "step")}{other ? `; ${other} cached or blocked` : ""}. Nothing was stored.</p>
          <Verdicts verdicts={r.verdicts} />
          {r.plan ? <PlanSteps plan={r.plan} /> : <p className="note">No plan: nothing would run.</p>}
        </>
      )}
    </div>
  );
}

function JobDetail({ j }) {
  const p = j.protocol, recs = (j.records || []).map((id) => wb.store.records.get(id) || { id, missing: true });
  const first = recs.find((r) => !r.missing), plan = wb.plans.get(j.id), planRead = wb.plans.has(j.id);
  const open = (r) => { wb.select({ record: r.id, kernel: r.kernel.name }); wb.showView("evidence"); };
  useEffect(() => { if (j.steps && !planRead) wb.openPlan(j.id); }, [j.id, j.steps, planRead]);
  return (
    <>
      <div className="block">
        <header><h2>Job {jobId(j.id)}</h2><JobStamp status={j.status} /></header>
        <p className="note">{j.reason}</p>
        <Kv rows={[
          ["proposed by", `the ${j.proposedBy}`], ["host", j.host],
          ["protocol", `${p.reps} repetitions × ${p.launches} timed launches, ${p.warmup} warm-up, seed ${p.seed}`],
          ["captures", `${plural(j.captures.length, "capture")} in ${plural(j.groups, "group")}, ${plural(j.steps, "step")}`],
          ["created", when(j.createdAt)], ["approved", when(j.approvedAt)], ["started", when(j.startedAt)], ["finished", when(j.finishedAt)],
          ["host time", secs(j.executorSeconds)],
          ["archive", j.archive ? <a className="mono" href={`${wb.server.base}/api/archives/${j.archive}`} title="Download the result archive">{shortId(j.archive)}</a> : "none yet"],
          j.runs ? ["runs", plural(j.runs.length, "run")] : null,
          j.error ? ["error", j.error, true] : null,
        ]} />
        {canApprove(j) || canCancel(j) || canReimport(j) ? <div className="actions"><Actions j={j} detail /></div> : null}
      </div>
      <div className="block">
        <header><h2>Captures</h2><span className="sub">the planner's verdicts</span></header>
        <Verdicts verdicts={j.captures} />
      </div>
      {j.steps ? (
        <div className="block">
          <header><h2>Plan</h2><span className="sub">{plural(j.steps, "step")}</span></header>
          {planRead && plan === null ? <p className="note">The server has no plan file for this job.</p> : <PlanSteps plan={plan} />}
        </div>
      ) : null}
      <div className="block">
        <header><h2>Events</h2><span className="sub">{j.events ? plural(j.events.length, "line") : "reading…"}</span></header>
        {j.events?.length ? (
          <div className="jev" role="log" aria-label={`Events of job ${jobId(j.id)}`}>
            {j.events.map((e, i) => <div key={i} className={cls(e.kind === "failed" && "bad")}><span className="t">{clock(e.at)}</span><span className="kd">{e.kind}</span><span className="s">{e.detail.trim()}</span></div>)}
          </div>
        ) : null}
      </div>
      <div className="block">
        <header><h2>Records</h2><span className="sub">{recs.length ? plural(recs.length, "record") : "none yet"}</span></header>
        {recs.length ? (
          <ul className="jrecs">
            {recs.map((r) => (r.missing
              ? <li key={r.id}><span className="mono dim" title={r.id}>{shortId(r.id)}</span> <span className="dim">not loaded</span></li>
              : <li key={r.id}><button type="button" className="link strong" onClick={() => open(r)} title="Open in Evidence">{r.kernel.name}</button><Val v={recordVal(r)} /><StatusStamp rec={r} /></li>))}
          </ul>
        ) : <p className="note">Records arrive when the job's archive is imported: one per kiln-kernels capture, with one sample per completed repetition. Captures of other kinds make runs only (Runs view).</p>}
        {first ? <div className="actions"><Btn sm onClick={() => open(first)}>Open in Evidence</Btn></div> : null}
      </div>
    </>
  );
}

/** The Devices view's line about the Kiln server: connected or not, and its hosts. */
export function ServerLine() {
  useLab("server", "device", "jobs");
  if (!wb.server) {
    return (
      <div className="toolbar srvline">
        <span className="dot sim" /><b>Kiln server</b>
        <span className="lbl">not served by the server · CUDA runs only on a Kiln host; <code>pnpm serve</code> starts the server</span>
      </div>
    );
  }
  const st = wb.serverInfo.state, active = wb.jobs.filter((j) => j.status === "approved" || j.status === "running" || j.status === "importing").length;
  return (
    <div className="toolbar srvline">
      <span className={cls("dot", st === "connected" ? "live" : "off")} /><b>Kiln server</b>
      <span className="lbl">{st}{wb.serverInfo.version ? ` · ${wb.serverInfo.version}` : ""} · {plural(wb.hosts.length, "host")}{active ? ` · ${plural(active, "job")} queued, running or importing` : ""}</span>
      <span className="sp" />
      <Btn sm onClick={() => wb.showView("jobs")}>Jobs</Btn>
    </div>
  );
}
