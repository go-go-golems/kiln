import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CatalogEntry } from '@/data/env';

/**
 * Which capture content hashes have artifacts. With the lab server online this mirrors its SQLite catalog
 * (measured and synthetic artifacts); offline it is the prototype's in-memory synthetic store.
 */
interface CatalogState {
  available: Record<string, CatalogEntry>;
  seededLabs: Record<string, true>;
}

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState: { available: {}, seededLabs: {} } as CatalogState,
  reducers: {
    seed(state, a: PayloadAction<{ labId: string; hashes: string[]; origin?: CatalogEntry['origin'] }>) {
      for (const h of a.payload.hashes) state.available[h] ??= { origin: a.payload.origin ?? 'seed', at: Date.now() };
      state.seededLabs[a.payload.labId] = true;
    },
    imported(state, a: PayloadAction<string[]>) {
      for (const h of a.payload) state.available[h] = { origin: 'job', at: Date.now() };
    },
    /** The server is the source of truth; local synthetic entries it does not know yet are kept. */
    catalogLoaded(state, a: PayloadAction<Record<string, { origin: 'synthetic' | 'measured'; source?: string | null; importedAt: string | null }>>) {
      const next: Record<string, CatalogEntry> = {};
      for (const [h, e] of Object.entries(a.payload)) next[h] = { origin: e.origin, source: e.source ?? null, at: e.importedAt ? Date.parse(e.importedAt) : Date.now() };
      for (const [h, e] of Object.entries(state.available)) if (!(h in next) && e.origin !== 'measured') next[h] = e;
      state.available = next;
    },
  },
});

export const { seed, imported, catalogLoaded } = catalogSlice.actions;
