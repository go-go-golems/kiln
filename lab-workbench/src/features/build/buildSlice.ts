import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { BuildFailure, IR } from '@/lang/ir';
import type { RootState } from '@/app/store';

export interface LabBuild {
  buildId: string | null;
  ir: IR | null;
  builtAt: number | null;
  error: BuildFailure | null;
}

interface BuildState {
  byLab: Record<string, LabBuild>;
}

const initialState: BuildState = { byLab: {} };

export const buildSlice = createSlice({
  name: 'build',
  initialState,
  reducers: {
    buildSucceeded(state, a: PayloadAction<{ labId: string; buildId: string; ir: IR }>) {
      state.byLab[a.payload.labId] = { buildId: a.payload.buildId, ir: a.payload.ir, builtAt: Date.now(), error: null };
    },
    buildFailed(state, a: PayloadAction<{ labId: string; failure: BuildFailure }>) {
      const prev = state.byLab[a.payload.labId];
      state.byLab[a.payload.labId] = { buildId: prev?.buildId ?? null, ir: prev?.ir ?? null, builtAt: prev?.builtAt ?? null, error: a.payload.failure };
    },
  },
});

export const { buildSucceeded, buildFailed } = buildSlice.actions;
export const selectLabBuild = (s: RootState, labId: string): LabBuild | undefined => s.build.byLab[labId];
