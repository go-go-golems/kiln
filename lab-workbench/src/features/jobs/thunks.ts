import type { AppThunk } from '@/app/store';
import type { CaptureSummary } from '@/lang/ir';
import { buildLab } from '@/features/build/thunks';
import { imported } from '@/features/catalog/catalogSlice';
import { toWire } from '@/features/catalog/wire';
import { serverJobUpdated, type ServerJob } from '@/features/server/thunks';
import { log } from '@/features/ui/uiSlice';
import { server } from '@/services/server';
import { jobAdded, jobUpdated, type Job } from './jobsSlice';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newJobId = () => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Proposes a job. With the lab server online the job is created there (with this id, so the returned handle
 * is valid immediately) and executed by its runner; a person's proposal is approved in the same request,
 * the assistant's waits. Offline, execution is simulated and the evidence stays synthetic.
 */
export const proposeJob =
  (args: { labId: string; captures: CaptureSummary[]; reason: string; by: 'user' | 'agent'; experiment?: string }): AppThunk<string> =>
  (dispatch, getState) => {
    const id = newJobId();
    const job: Job = {
      id,
      labId: args.labId,
      experiment: args.experiment ?? null,
      captures: args.captures,
      host: [...new Set(args.captures.map((c) => c.host))].join(', '),
      budget: +args.captures.reduce((a, c) => a + c.estimateGpuMin, 0).toFixed(1),
      reason: args.reason,
      proposedBy: args.by,
      status: 'proposed',
      progress: 0,
      events: [{ at: Date.now(), kind: 'job.proposed', detail: args.reason }],
      createdAt: Date.now(),
    };
    dispatch(jobAdded(job));
    dispatch(log('info', `${id} proposed by ${args.by}: ${args.captures.length} captures on ${job.host} (≈ ${job.budget} gpu-min)`));
    if (getState().server.status === 'online') {
      void server
        .post<ServerJob>('/jobs', {
          id,
          labId: args.labId,
          captures: args.captures.map(toWire),
          reason: args.reason,
          proposedBy: args.by === 'agent' ? 'assistant' : 'user',
          budgetGpuMin: job.budget,
          approve: args.by === 'user',
        })
        .then((j) => dispatch(serverJobUpdated(j)))
        .catch((e: Error) => {
          dispatch(jobUpdated({ id, status: 'failed', event: { at: Date.now(), kind: 'job.failed', detail: e.message } }));
          dispatch(log('error', `${id} rejected by the lab server: ${e.message}`));
        });
    } else if (args.captures.some((c) => c.host === 'local')) {
      // simulating a local capture would mint synthetic evidence for a host that measures for real
      dispatch(jobUpdated({ id, status: 'failed', event: { at: Date.now(), kind: 'job.failed', detail: 'the lab server is offline; local captures run only on it' } }));
      dispatch(log('error', `${id}: local captures need the lab server (pnpm lab-server)`));
    } else if (args.by === 'user') dispatch(approveJob(id));
    return id;
  };

export const approveJob =
  (id: string): AppThunk =>
  (dispatch, getState) => {
    const job = getState().jobs.list.find((j) => j.id === id);
    if (!job || job.status !== 'proposed') return;
    dispatch(jobUpdated({ id, status: 'approved', event: { at: Date.now(), kind: 'job.approved' } }));
    if (getState().server.status === 'online') {
      void server
        .post<ServerJob>(`/jobs/${id}/approve`)
        .then((j) => dispatch(serverJobUpdated(j)))
        .catch((e: Error) => dispatch(log('error', `${id} could not be approved: ${e.message}`)));
    } else void dispatch(runJob(id));
  };

export const cancelJob =
  (id: string): AppThunk =>
  (dispatch, getState) => {
    const job = getState().jobs.list.find((j) => j.id === id);
    if (!job || ['done', 'failed', 'cancelled'].includes(job.status)) return;
    dispatch(jobUpdated({ id, status: 'cancelled', event: { at: Date.now(), kind: 'job.cancelled' } }));
    dispatch(log('warn', `${id} cancelled`));
    if (getState().server.status === 'online')
      void server
        .post<ServerJob>(`/jobs/${id}/cancel`)
        .then((j) => dispatch(serverJobUpdated(j)))
        .catch((e: Error) => dispatch(log('error', `${id} could not be cancelled: ${e.message}`)));
  };

/** Offline only: a simulated run whose captures become synthetic artifacts. */
const runJob =
  (id: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const cancelled = () => getState().jobs.list.find((j) => j.id === id)?.status === 'cancelled';
    const job = getState().jobs.list.find((j) => j.id === id)!;
    const total = job.captures.reduce((a, c) => a + c.reps, 0) || 1;
    let done = 0;
    dispatch(jobUpdated({ id, status: 'running' }));
    for (const c of job.captures) {
      if (cancelled()) return;
      dispatch(jobUpdated({ id, event: { at: Date.now(), kind: 'capture.started', detail: `${c.ref} on ${c.host}` } }));
      for (let rep = 0; rep < c.reps; rep++) {
        await sleep(Math.min(260, 4000 / total));
        if (cancelled()) return;
        done++;
        dispatch(jobUpdated({ id, progress: done / total, event: { at: Date.now(), kind: 'run.done', detail: `${c.ref}#${rep}` } }));
      }
      dispatch(jobUpdated({ id, status: 'importing' }));
      await sleep(180);
      dispatch(imported([c.hash]));
      dispatch(jobUpdated({ id, status: 'running', event: { at: Date.now(), kind: 'run.imported', detail: c.ref } }));
    }
    // rebuild before reporting done, so anyone awaiting the job sees the imported evidence
    dispatch(buildLab(job.labId, 'rebuild after import'));
    dispatch(jobUpdated({ id, status: 'done', progress: 1, event: { at: Date.now(), kind: 'job.done' } }));
    dispatch(log('ok', `${id} done: ${job.captures.length} captures imported`));
  };
