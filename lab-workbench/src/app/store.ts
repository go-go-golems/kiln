import { configureStore, type ThunkAction, type UnknownAction } from '@reduxjs/toolkit';
import { agentSlice, MODEL_KEY } from '@/features/agent/agentSlice';
import { annotationsSlice } from '@/features/annotations/annotationsSlice';
import { buildSlice } from '@/features/build/buildSlice';
import { catalogSlice } from '@/features/catalog/catalogSlice';
import { jobsSlice } from '@/features/jobs/jobsSlice';
import { paramsSlice } from '@/features/params/paramsSlice';
import { programSlice } from '@/features/program/programSlice';
import { selectionSlice } from '@/features/selection/selectionSlice';
import { serverSlice } from '@/features/server/serverSlice';
import { signalsSlice } from '@/features/signals/signalsSlice';
import { LAYOUT_STORAGE_KEY, uiSlice } from '@/features/ui/uiSlice';
import { labApi } from '@/services/labApi';
import { server } from '@/services/server';

export const store = configureStore({
  reducer: {
    program: programSlice.reducer,
    build: buildSlice.reducer,
    params: paramsSlice.reducer,
    signals: signalsSlice.reducer,
    selection: selectionSlice.reducer,
    catalog: catalogSlice.reducer,
    jobs: jobsSlice.reducer,
    agent: agentSlice.reducer,
    annotations: annotationsSlice.reducer,
    ui: uiSlice.reducer,
    server: serverSlice.reducer,
    [labApi.reducerPath]: labApi.reducer,
  },
  middleware: (getDefault) =>
    getDefault({
      // IRs are large plain objects; skip the dev-only deep checks on them.
      serializableCheck: { ignoredPaths: ['build'], warnAfter: 128 },
      immutableCheck: { ignoredPaths: ['build'], warnAfter: 128 },
    }).concat(labApi.middleware),
});

// Pane sizes and open/closed state are per-viewer conveniences: persist them, tolerate storage failures.
let lastLayout = '';
store.subscribe(() => {
  const { ideOpen, inspectorOpen, ideWidth, inspectorWidth, inspectorHeight, inspectorDock, consoleHeight } = store.getState().ui;
  const next = JSON.stringify({ ideOpen, inspectorOpen, ideWidth, inspectorWidth, inspectorHeight, inspectorDock, consoleHeight });
  if (next === lastLayout) return;
  lastLayout = next;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, next);
  } catch {
    // private windows or blocked storage: the layout simply is not remembered
  }
});

// The assistant model is this viewer's choice, like the layout.
let lastModel: string | null | undefined;
store.subscribe(() => {
  const m = store.getState().agent.model;
  if (m === lastModel) return;
  lastModel = m;
  try {
    if (m) localStorage.setItem(MODEL_KEY, m);
    else localStorage.removeItem(MODEL_KEY);
  } catch {
    // the choice lasts for this session
  }
});

// Edited programs persist on the lab server (debounced); deleting an edit restores the preset there too.
let lastSources: Record<string, string> = {};
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
store.subscribe(() => {
  const { program, server: srv } = store.getState();
  if (program.sources === lastSources) return;
  const prev = lastSources;
  lastSources = program.sources;
  if (srv.status !== 'online') return;
  for (const labId of new Set([...Object.keys(prev), ...Object.keys(program.sources)])) {
    if (prev[labId] === program.sources[labId]) continue;
    clearTimeout(saveTimers.get(labId));
    saveTimers.set(
      labId,
      setTimeout(() => {
        const source = store.getState().program.sources[labId];
        const path = `/programs/${encodeURIComponent(labId)}`;
        void (source === undefined ? server.del(path) : server.put(path, { source })).catch(() => {
          // the edit stays in the browser; the next change retries
        });
      }, 800),
    );
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;
