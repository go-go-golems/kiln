import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/app/store';

export interface EvalResult {
  ok: boolean;
  value?: string;
  error?: string;
  logs: string[];
  ms: number;
  rolledBack?: boolean;
}

export interface TokenUsage {
  input: number | null;
  output: number | null;
  reasoning: number | null;
  total: number | null;
  /** characters sent ÷ 4: the gateway's input count omits system-role content */
  estPrompt?: number | null;
}

export interface Turn {
  id: string;
  /** The board the turn was asked on; `self` in its code. */
  board: string;
  role: 'user' | 'agent';
  text: string;
  code?: string;
  status: 'running' | 'done';
  result?: EvalResult;
  jobId?: string;
  mode?: 'scripted' | 'live';
  /** the message id in the server's transcript */
  serverId?: string;
  model?: string;
  usage?: TokenUsage | null;
  step?: number;
  /** the model's text is still arriving */
  streaming?: boolean;
  /** code the model wrote after its last allowed execution; shown, never run */
  skipped?: boolean;
  error?: string;
}

export const MODEL_KEY = 'perf-lab:assistant-model';
const storedModel = (): string | null => {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
};

interface AgentState {
  mode: 'scripted' | 'live';
  /** provider/id:thinking chosen by this viewer; null → the server's default */
  model: string | null;
  view: 'chat' | 'library';
  byLab: Record<string, { turns: Turn[]; loaded?: boolean }>;
}

const lab = (s: AgentState, id: string) => (s.byLab[id] ??= { turns: [] });

export const agentSlice = createSlice({
  name: 'agent',
  initialState: { mode: 'scripted', model: storedModel(), view: 'chat', byLab: {} } as AgentState,
  reducers: {
    turnAdded(state, a: PayloadAction<{ labId: string; turn: Turn }>) {
      lab(state, a.payload.labId).turns.push(a.payload.turn);
    },
    turnUpdated(state, a: PayloadAction<{ labId: string; id: string; patch: Partial<Turn> }>) {
      const t = lab(state, a.payload.labId).turns.find((x) => x.id === a.payload.id);
      if (t) Object.assign(t, a.payload.patch);
    },
    clearTurns(state, a: PayloadAction<string>) {
      lab(state, a.payload).turns = [];
    },
    turnText(state, a: PayloadAction<{ labId: string; id: string; delta: string }>) {
      const t = lab(state, a.payload.labId).turns.find((x) => x.id === a.payload.id);
      if (t) t.text += a.payload.delta;
    },
    /** A transcript loaded from the server; turns asked in this session before it arrived stay after it. */
    transcriptLoaded(state, a: PayloadAction<{ labId: string; turns: Turn[] }>) {
      const l = lab(state, a.payload.labId);
      const known = new Set(a.payload.turns.map((t) => t.serverId).filter(Boolean));
      l.turns = [...a.payload.turns, ...l.turns.filter((t) => !t.serverId || !known.has(t.serverId))];
      l.loaded = true;
    },
    setMode(state, a: PayloadAction<'scripted' | 'live'>) {
      state.mode = a.payload;
    },
    setModel(state, a: PayloadAction<string | null>) {
      state.model = a.payload;
    },
    setView(state, a: PayloadAction<'chat' | 'library'>) {
      state.view = a.payload;
    },
    /** Forget the lab's loaded transcript so the next load fetches it again (after a restore). */
    transcriptStale(state, a: PayloadAction<string>) {
      const l = lab(state, a.payload);
      l.turns = [];
      l.loaded = false;
    },
  },
});

export const { turnAdded, turnUpdated, clearTurns, turnText, transcriptLoaded, setMode, setModel, setView, transcriptStale } = agentSlice.actions;
const EMPTY = { turns: [] as Turn[] };
export const selectAgentLab = (s: RootState, labId: string) => s.agent.byLab[labId] ?? EMPTY;
