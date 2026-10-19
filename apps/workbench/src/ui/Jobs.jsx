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

// ----------------------------------------------------------------------------- Jobs (guide §30.4)
// CUDA jobs on the Kiln server's executors, newest first. A job's status is a word in a stamp: solid once it ran to
// the end, red when it failed, dashed while it waits or runs. Measure on a server device proposes and approves one;
// an agent's job waits here for Approve. The side panel follows the selected job's events and lists its records.
const STATUS = {
  proposed: "proposed: waits for the user to approve it",
  approved: "approved: queued for its executor",
  running: "running on its executor",
  done: "done: every repetition ran",
  failed: "failed: stopped with an error; its partial records are kept, invalid",
  cancelled: "cancelled: its partial records are kept, invalid",
};
export function JobStamp({ status }) {
  return <span className={cls("stamp", status === "done" && "solid", status === "failed" && "bad")} title={STATUS[status]}>{status}</span>;
}

const canApprove = (j) => j.status === "proposed";
const canCancel = (j) => j.status === "proposed" || j.status === "approved" || j.status === "running";
function Actions({ j }) {
  const act = (action) => (e) => { e.stopPropagation(); wb.jobAction(j.id, action); };
  return (
    <>
      {canApprove(j) ? <Btn sm primary onClick={act("approve")} title="Run this job on its executor">Approve</Btn> : null}
      {canCancel(j) ? <Btn sm onClick={act("cancel")} title={j.status === "running" ? "Stop the runner; the repetitions done so far become invalid records" : "Withdraw the job before it runs"}>Cancel</Btn> : null}
    </>
  );
}

export function JobsView() {
  useLab("jobs", "server", "sel", "store", "device");
  const jobs = wb.jobs, executors = wb.devices.filter((d) => d.server);
  const sel = jobs.find((j) => j.id === wb.sel.job) || jobs[0] || null;
  // the list carries no events: read the selected job in full once
  useEffect(() => { if (sel && !sel.events) wb.openJob(sel.id); }, [sel?.id, !sel?.events]);
  if (!wb.server) {
    return (
      <div className="page col">
        <Empty>Not served by the Kiln server, so there are no jobs. Jobs run kernels on the server's CUDA executors: start it with <code>pnpm serve</code> (<code>pnpm dev</code> builds the page first) and open <code>http://127.0.0.1:5280/</code>. Without it, CUDA runs go through the runner or a bundle (Devices).</Empty>
      </div>
    );
  }
  const counts = ["proposed", "approved", "running", "done", "failed", "cancelled"].map((s) => [s, jobs.filter((j) => j.status === s).length]).filter(([, n]) => n);
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <span className="lbl">{plural(jobs.length, "job")}{counts.map(([s, n]) => ` · ${n} ${s}`).join("")}</span>
          <span className="sp" />
          <Btn sm onClick={() => wb.serverReread()} title="Read the jobs, devices and records again">Refresh</Btn>
        </div>
        <div className="scroll">
          {!executors.length ? <Empty>The server has no executors, so it cannot run jobs. Add a profile to <code>executors.json</code> in its data directory (see <code>apps/server/README.md</code>) and restart it.</Empty> : null}
          {jobs.length ? (
            <div className="xscroll">
              <table className="rt evt jobt">
                <thead><tr><th>status</th><th>job</th><th>kernels</th><th className="at">times</th><th className="num" title="seconds the executor spent on the job's repetitions">executor</th><th /></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className={cls("clickable", sel === j && "sel")} tabIndex={0} onClick={() => wb.openJob(j.id)} onKeyDown={(e) => { if (e.key === "Enter") wb.openJob(j.id); }}>
                      <td><JobStamp status={j.status} /></td>
                      <td className="jwhat"><span>{j.reason}</span><small>by the {j.proposedBy} · {j.executor} · <span className="mono">{jobId(j.id)}</span></small></td>
                      <td>{plural(j.kernels.length, "kernel")}<small>{protocolText(j.protocol)}</small></td>
                      <td className="at"><small>created {clock(j.createdAt)}</small><small>started {clock(j.startedAt)}</small><small>finished {clock(j.finishedAt)}</small></td>
                      <td className="num">{secs(j.executorSeconds)}</td>
                      <td className="acts"><Actions j={j} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : executors.length ? <Empty>No jobs yet. Pick a server device ({executors.map((d) => d.label).join(", ")}) in Perf or Devices and Measure: the page proposes the program's kernels as a job and approves it.</Empty> : null}
          <div className="titleblock">
            <div><label>server</label><b>{wb.serverInfo.state}{wb.serverInfo.version ? ` · ${wb.serverInfo.version}` : ""}</b></div>
            <div><label>executors</label><b>{executors.length ? executors.map((d) => d.executor).join(", ") : "none"}</b></div>
            <div><label>jobs</label><b>{jobs.length} shown · newest first</b></div>
          </div>
        </div>
      </div>
      <aside className="side">
        {sel ? <JobDetail j={sel} /> : <div className="block"><p className="note">A job runs a program's kernels on one executor under a protocol: repetitions, each a fresh runner process with the kernels in a seeded shuffled order. Every kernel becomes one record with one sample per completed repetition.</p></div>}
      </aside>
    </div>
  );
}

function JobDetail({ j }) {
  const p = j.protocol, recs = (j.records || []).map((id) => wb.store.records.get(id) || { id, missing: true });
  const first = recs.find((r) => !r.missing);
  const open = (r) => { wb.select({ record: r.id, kernel: r.kernel.name }); wb.showView("evidence"); };
  return (
    <>
      <div className="block">
        <header><h2>Job {jobId(j.id)}</h2><JobStamp status={j.status} /></header>
        <p className="note">{j.reason}</p>
        <Kv rows={[
          ["proposed by", `the ${j.proposedBy}`], ["executor", j.executor],
          ["protocol", `${p.reps} repetitions × ${p.launches} timed launches, ${p.warmup} warm-up, seed ${p.seed}`],
          ["kernels", j.kernels.map((k) => k.name).join(", ")], ["code generator", j.codegen],
          ["created", when(j.createdAt)], ["approved", when(j.approvedAt)], ["started", when(j.startedAt)], ["finished", when(j.finishedAt)],
          ["executor time", secs(j.executorSeconds)], j.error ? ["error", j.error, true] : null,
        ]} />
        {canApprove(j) || canCancel(j) ? <div className="actions"><Actions j={j} /></div> : null}
      </div>
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
        ) : <p className="note">A job's records arrive when it ends: one per kernel, with one sample per completed repetition. The compile decides with them from then on.</p>}
        {first ? <div className="actions"><Btn sm onClick={() => open(first)}>Open in Evidence</Btn></div> : null}
      </div>
    </>
  );
}

/** The Devices view's line about the Kiln server: connected or not, and its executors. */
export function ServerLine() {
  useLab("server", "device", "jobs");
  const n = wb.devices.filter((d) => d.server).length;
  if (!wb.server) {
    return (
      <div className="toolbar srvline">
        <span className="dot sim" /><b>Kiln server</b>
        <span className="lbl">not served by the server · CUDA runs through the runner or a bundle; <code>pnpm serve</code> starts the server</span>
      </div>
    );
  }
  const st = wb.serverInfo.state, active = wb.jobs.filter((j) => j.status === "approved" || j.status === "running").length;
  return (
    <div className="toolbar srvline">
      <span className={cls("dot", st === "connected" ? "live" : "off")} /><b>Kiln server</b>
      <span className="lbl">{st}{wb.serverInfo.version ? ` · ${wb.serverInfo.version}` : ""} · {plural(n, "executor")}{active ? ` · ${plural(active, "job")} queued or running` : ""}</span>
      <span className="sp" />
      <Btn sm onClick={() => wb.showView("jobs")}>Jobs</Btn>
    </div>
  );
}
