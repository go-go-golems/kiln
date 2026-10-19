import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CaptureSummary } from '@/lang/ir';
import type { RootState } from '@/app/store';

export interface PendingPlan {
  changes: { key: string; urlKey: string; from: unknown; to: unknown }[];
  captures: CaptureSummary[];
  estimateGpuMin: number;
  hosts: string[];
  candidateBuildId: string;
}

export interface LabParams {
  /** What the controls and the URL show. */
  values: Record<string, unknown>;
  /** What the current build and every view use; differs from `values` only for a pending plan. */
  applied: Record<string, unknown>;
  pending: PendingPlan | null;
}

interface ParamsState {
  byLab: Record<string, LabParams>;
}

const empty = (): LabParams => ({ values: {}, applied: {}, pending: null });
const lab = (s: ParamsState, id: string) => (s.byLab[id] ??= empty());

export const paramsSlice = createSlice({
  name: 'params',
  initialState: { byLab: {} } as ParamsState,
  reducers: {
    setValue(state, a: PayloadAction<{ labId: string; key: string; value: unknown }>) {
      lab(state, a.payload.labId).values[a.payload.key] = a.payload.value;
    },
    applyValues(state, a: PayloadAction<{ labId: string; values: Record<string, unknown> }>) {
      const l = lab(state, a.payload.labId);
      Object.assign(l.values, a.payload.values);
      Object.assign(l.applied, a.payload.values);
    },
    resetValue(state, a: PayloadAction<{ labId: string; key: string }>) {
      const l = lab(state, a.payload.labId);
      delete l.values[a.payload.key];
      delete l.applied[a.payload.key];
    },
    setPending(state, a: PayloadAction<{ labId: string; pending: PendingPlan | null }>) {
      lab(state, a.payload.labId).pending = a.payload.pending;
    },
    revertPending(state, a: PayloadAction<string>) {
      const l = lab(state, a.payload);
      for (const c of l.pending?.changes ?? []) {
        if (c.key in l.applied) l.values[c.key] = l.applied[c.key];
        else delete l.values[c.key];
      }
      l.pending = null;
    },
    restoreLab(state, a: PayloadAction<{ labId: string; snapshot: LabParams }>) {
      state.byLab[a.payload.labId] = a.payload.snapshot;
    },
  },
});

export const { setValue, applyValues, resetValue, setPending, revertPending, restoreLab } = paramsSlice.actions;
export const selectLabParams = (s: RootState, labId: string): LabParams => s.params.byLab[labId] ?? EMPTY;
const EMPTY: LabParams = { values: {}, applied: {}, pending: null };
