import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { presetById } from '@/presets';
import type { RootState } from '@/app/store';

interface ProgramState {
  /** Edited sources by lab id; a preset's own source applies when absent. */
  sources: Record<string, string>;
  autoBuild: boolean;
}

const initialState: ProgramState = { sources: {}, autoBuild: true };

export const programSlice = createSlice({
  name: 'program',
  initialState,
  reducers: {
    setSource(state, a: PayloadAction<{ labId: string; source: string }>) {
      state.sources[a.payload.labId] = a.payload.source;
    },
    resetSource(state, a: PayloadAction<string>) {
      delete state.sources[a.payload];
    },
    setAutoBuild(state, a: PayloadAction<boolean>) {
      state.autoBuild = a.payload;
    },
  },
});

export const { setSource, resetSource, setAutoBuild } = programSlice.actions;
export const selectSource = (s: RootState, labId: string) => s.program.sources[labId] ?? presetById(labId)?.source ?? '';
export const selectEdited = (s: RootState, labId: string) =>
  labId in s.program.sources && s.program.sources[labId] !== presetById(labId)?.source;
