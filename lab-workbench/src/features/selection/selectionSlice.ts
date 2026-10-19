import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/app/store';

export type InspectorTab = 'lab' | 'graph' | 'plan' | 'runs' | 'inspect' | 'agent';

/** What the inspector shows. Mirrored to the URL as ?tab=, ?sel= and ?node=. */
interface SelectionState {
  tab: InspectorTab;
  sel: string | null;
  node: string | null;
}

export const selectionSlice = createSlice({
  name: 'selection',
  initialState: { tab: 'lab', sel: null, node: null } as SelectionState,
  reducers: {
    setTab(state, a: PayloadAction<InspectorTab>) {
      state.tab = a.payload;
    },
    select(state, a: PayloadAction<string | null>) {
      state.sel = a.payload;
    },
    selectNode(state, a: PayloadAction<string | null>) {
      state.node = a.payload;
    },
    hydrate(state, a: PayloadAction<Partial<SelectionState>>) {
      Object.assign(state, a.payload);
    },
  },
});

export const { setTab, select, selectNode, hydrate } = selectionSlice.actions;
export const selectSelection = (s: RootState) => s.selection;
