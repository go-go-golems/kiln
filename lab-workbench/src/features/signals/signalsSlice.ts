import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/app/store';

/** Board signal values. Entities are stored by reference (`{ __ent: ref }`) and rehydrated on read. */
interface SignalsState {
  byLab: Record<string, Record<string, unknown>>;
}

export const signalsSlice = createSlice({
  name: 'signals',
  initialState: { byLab: {} } as SignalsState,
  reducers: {
    setSignal(state, a: PayloadAction<{ labId: string; key: string; value: unknown }>) {
      (state.byLab[a.payload.labId] ??= {})[a.payload.key] = a.payload.value;
    },
    restoreSignals(state, a: PayloadAction<{ labId: string; values: Record<string, unknown> }>) {
      state.byLab[a.payload.labId] = a.payload.values;
    },
  },
});

export const { setSignal, restoreSignals } = signalsSlice.actions;
const EMPTY: Record<string, unknown> = {};
export const selectSignals = (s: RootState, labId: string) => s.signals.byLab[labId] ?? EMPTY;
