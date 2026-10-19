import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ServerHealth {
  probe: { ok: boolean; error?: string; ms?: number };
  /** absent on servers older than ML-PERF-002 */
  features?: string[];
  assistant: { available: boolean; model?: string; reason?: string };
}

/** A model the pi agent has credentials for (server/assistant/model.ts ModelInfo). */
export interface ModelInfo {
  spec: string;
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  thinking: string[];
  contextWindow: number | null;
}

interface ServerState {
  /** unknown until the first health check; offline keeps the workbench on synthetic data */
  status: 'unknown' | 'online' | 'offline';
  health: ServerHealth | null;
  error: string | null;
  models: ModelInfo[];
  /** provider/id:thinking used when the viewer has not chosen one */
  defaultModel: string | null;
}

export const serverSlice = createSlice({
  name: 'server',
  initialState: { status: 'unknown', health: null, error: null, models: [], defaultModel: null } as ServerState,
  reducers: {
    serverOnline(state, a: PayloadAction<ServerHealth>) {
      state.status = 'online';
      state.health = a.payload;
      state.error = null;
    },
    modelsLoaded(state, a: PayloadAction<{ models: ModelInfo[]; defaultModel: string }>) {
      state.models = a.payload.models;
      state.defaultModel = a.payload.defaultModel;
    },
    serverOffline(state, a: PayloadAction<string>) {
      state.status = 'offline';
      state.error = a.payload;
    },
  },
});

export const { serverOnline, serverOffline, modelsLoaded } = serverSlice.actions;
