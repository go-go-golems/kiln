import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/app/store';

/** Notes added after a build — by a person or the assistant — never observed evidence. */
export interface Alternative {
  text: string;
  evidence: string[];
  test?: string;
  by: string;
  prov: 'heuristic';
}

interface AnnotationsState {
  byLab: Record<string, Record<string, { alternatives: Alternative[] }>>;
}

export const annotationsSlice = createSlice({
  name: 'annotations',
  initialState: { byLab: {} } as AnnotationsState,
  reducers: {
    alternativeAdded(state, a: PayloadAction<{ labId: string; hypothesis: string; alternative: Alternative }>) {
      const l = (state.byLab[a.payload.labId] ??= {});
      (l[a.payload.hypothesis] ??= { alternatives: [] }).alternatives.push(a.payload.alternative);
    },
    restoreAnnotations(state, a: PayloadAction<{ labId: string; value: Record<string, { alternatives: Alternative[] }> }>) {
      state.byLab[a.payload.labId] = a.payload.value;
    },
  },
});

export const { alternativeAdded, restoreAnnotations } = annotationsSlice.actions;
const EMPTY: Record<string, { alternatives: Alternative[] }> = {};
export const selectAnnotations = (s: RootState, labId: string) => s.annotations.byLab[labId] ?? EMPTY;
