import { useMemo, useState } from 'react';
import { DataBlock } from '@/components/molecules/DataBlock';
import { minutesUnit } from '@/lib/format';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/atoms/Button';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { Meter } from '@/components/atoms/Meter';
import { EmptyState } from '@/components/molecules/EmptyState';
import type { Job } from '@/features/jobs/jobsSlice';
import { approveJob, cancelJob, proposeJob } from '@/features/jobs/thunks';
import { selectLabParams } from '@/features/params/paramsSlice';
import { revertPlan, runPendingPlan } from '@/features/params/thunks';
import type { CaptureSummary, IR } from '@/lang/ir';
import './PlanTab.css';

const tone = (s: string) => (s === 'cached' ? 'neutral' : s === 'execute' ? 'warn' : s === 'import' ? 'sig' : 'bad') as 'neutral' | 'warn' | 'sig' | 'bad';

export const JobCard: React.FC<{ job: Job }> = ({ job }) => {
  const dispatch = useAppDispatch();
  return (
    <div className={`job job--${job.status}`}>
      <div className="job__head">
        <span className="mono">{job.id}</span>
        <Chip tone={job.status === 'done' ? 'ok' : job.status === 'proposed' ? 'warn' : job.status === 'cancelled' || job.status === 'failed' ? 'bad' : 'sig'} variant="tint">
          {job.status}
        </Chip>
        <span className="muted">by {job.proposedBy}</span>
        <Meter steps={false} value={job.progress} max={1} label="progress" tone={job.status === 'done' ? 'ok' : 'ink'} />
      </div>
      <div className="job__reason">{job.reason}</div>
      <div className="job__meta mono">
        {job.captures.length} captures · {job.captures.reduce((a, c) => a + c.reps, 0)} runs · {job.host} · ≈ {job.budget} {minutesUnit(job.host)}
      </div>
      {job.status === 'proposed' ? (
        <div className="job__actions">
          <Button size="sm" variant="primary" icon="check" onClick={() => dispatch(approveJob(job.id))}>
            Approve and run
          </Button>
          <Button size="sm" variant="ghost" icon="close" onClick={() => dispatch(cancelJob(job.id))}>
            Decline
          </Button>
        </div>
      ) : job.status === 'running' || job.status === 'approved' || job.status === 'importing' ? (
        <div className="job__actions">
          <Button size="sm" variant="danger" icon="stop" onClick={() => dispatch(cancelJob(job.id))}>
            Cancel
          </Button>
        </div>
      ) : null}
      <ol className="job__events mono">
        {job.events.slice(-4).map((e, i) => (
          <li key={i}>
            {new Date(e.at).toTimeString().slice(0, 8)} {e.kind} {e.detail ?? ''}
          </li>
        ))}
      </ol>
    </div>
  );
};

/** Stages, cache status and the lowered runner specification of every capture; pending plans and jobs. */
export const PlanTab: React.FC<{ labId: string; ir: IR }> = ({ labId, ir }) => {
  const dispatch = useAppDispatch();
  const pending = useAppSelector((s) => selectLabParams(s, labId).pending);
  // filter outside the selector: a selector returning a new array on every call re-renders on every store change
  const allJobs = useAppSelector((s) => s.jobs.list);
  const jobs = useMemo(() => allJobs.filter((j) => j.labId === labId), [allJobs, labId]);
  const [open, setOpen] = useState<string | null>(null);
  const toRun = ir.plan.captures.filter((c) => c.status === 'execute' || c.status === 'import');
  const imports = toRun.filter((c) => c.status === 'import').length;
  const row = (c: CaptureSummary) => (
    <li key={c.id}>
      <button type="button" className={`plan__cap${open === c.id ? ' is-open' : ''}`} onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
        <Chip tone={tone(c.status)} variant={c.status === 'cached' ? 'outline' : 'tint'}>
          {c.status}
        </Chip>
        <span className="plan__ref mono">{c.ref}</span>
        <span className="plan__meta mono">
          ×{c.reps} · {c.hash.slice(0, 8)} · {c.estimateGpuMin} {minutesUnit(c.host)}
        </span>
        {c.blockedOn ? <span className="plan__blocked mono">blocked on {c.blockedOn}</span> : null}
      </button>
      {open === c.id ? <DataBlock className="plan__json" value={c.lowered} label={`lowered spec · ${c.hash}`} /> : null}
    </li>
  );
  return (
    <div className="plan">
      {pending ? (
        <section className="plan__pending">
          <Eyebrow as="h3" tone="warn">Pending plan</Eyebrow>
          <ul className="mono">
            {pending.changes.map((c) => (
              <li key={c.key}>
                {c.urlKey}: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}
              </li>
            ))}
          </ul>
          <ul className="plan__caps">{pending.captures.map(row)}</ul>
          <div className="plan__actions">
            <Button variant="primary" icon="play" onClick={() => dispatch(runPendingPlan(labId))}>
              Run {pending.captures.length} captures
            </Button>
            <Button variant="ghost" icon="reset" onClick={() => dispatch(revertPlan(labId))}>
              Revert
            </Button>
          </div>
        </section>
      ) : null}
      <section>
        <Eyebrow as="h3" tone="accent">
          Plan · {ir.plan.cached} cached · {ir.plan.execute} execute{ir.plan.import ? ` · ${ir.plan.import} import` : ''} · {ir.plan.blocked} blocked
        </Eyebrow>
        {toRun.length ? (
          <div className="plan__actions">
            <Button
              size="sm"
              variant="primary"
              icon="play"
              onClick={() => dispatch(proposeJob({ labId, captures: toRun, reason: imports === toRun.length ? 'import the program’s evidence' : 'run the program’s missing captures', by: 'user' }))}
            >
              {imports === toRun.length ? `Import ${imports} captures from evidence` : imports ? `Run ${toRun.length - imports}, import ${imports} captures` : `Run ${toRun.length} missing captures`}
            </Button>
          </div>
        ) : null}
        {ir.plan.stages.map((s) => (
          <div key={s.stage} className="plan__stage">
            <div className="plan__stagehead mono">
              stage {s.stage} · {s.label}
            </div>
            {s.stage === 0 ? (
              <ul className="plan__caps">
                {s.captures.map((c) => (
                  <li key={c} className="plan__cap plan__cap--static">
                    <Chip>cached</Chip>
                    <span className="mono">{c}</span>
                    <span className="plan__meta mono">{c === 'capabilities@local' ? 'probe of this machine (lab server)' : 'synthetic capability report'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="plan__caps">{ir.plan.captures.filter((c) => s.captures.includes(c.id)).map(row)}</ul>
            )}
          </div>
        ))}
        {ir.experiments.some((e) => e.limitations.length) ? (
          <div className="plan__limits">
            <Eyebrow>Limitations</Eyebrow>
            <ul>
              {ir.experiments.flatMap((e) => e.limitations.map((l) => <li key={`${e.id}${l}`}>{e.id}: {l}</li>))}
            </ul>
          </div>
        ) : null}
      </section>
      <section>
        <Eyebrow as="h3" tone="accent">Jobs</Eyebrow>
        {jobs.length ? jobs.map((j) => <JobCard key={j.id} job={j} />) : <EmptyState title="No jobs yet" hint="A pending plan or an assistant proposal creates one." />}
      </section>
    </div>
  );
};
