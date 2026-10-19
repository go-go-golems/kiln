import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CaptureSummary } from '@/lang/ir';
import type { RootState } from '@/app/store';

export type JobStatus = 'proposed' | 'approved' | 'running' | 'importing' | 'done' | 'failed' | 'cancelled';

export interface JobEvent {
  at: number;
  /** job.proposed, job.approved, run.started, run.imported, script.request, job.done, … */
  kind: string;
  detail?: string;
}

export interface Job {
  id: string;
  labId: string;
  experiment: string | null;
  captures: CaptureSummary[];
  host: string;
  budget: number;
  reason: string;
  proposedBy: 'user' | 'agent';
  status: JobStatus;
  progress: number;
  events: JobEvent[];
  createdAt: number;
  error?: string | null;
}

interface JobsState {
  list: Job[];
}

export const jobsSlice = createSlice({
  name: 'jobs',
  initialState: { list: [] } as JobsState,
  reducers: {
    jobAdded(state, a: PayloadAction<Job>) {
      state.list.unshift(a.payload);
    },
    jobUpdated(state, a: PayloadAction<{ id: string; status?: JobStatus; progress?: number; event?: JobEvent }>) {
      const j = state.list.find((x) => x.id === a.payload.id);
      if (!j) return;
      if (a.payload.status) j.status = a.payload.status;
      if (a.payload.progress !== undefined) j.progress = a.payload.progress;
      if (a.payload.event) j.events.push(a.payload.event);
    },
    /** The server's view of a job replaces the local one (newest first, like jobAdded). */
    jobUpserted(state, a: PayloadAction<Job>) {
      const i = state.list.findIndex((x) => x.id === a.payload.id);
      if (i >= 0) state.list[i] = a.payload;
      else state.list.unshift(a.payload);
    },
  },
});

export const { jobAdded, jobUpdated, jobUpserted } = jobsSlice.actions;
export const selectJobs = (s: RootState, labId: string) => s.jobs.list.filter((j) => j.labId === labId);
export const selectJob = (s: RootState, id: string) => s.jobs.list.find((j) => j.id === id);
