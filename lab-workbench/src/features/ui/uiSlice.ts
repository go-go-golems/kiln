import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ConsoleLine {
  id: number;
  at: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  text: string;
  line?: number;
}

interface UiState {
  theme: 'system' | 'light' | 'dark';
  ideOpen: boolean;
  inspectorOpen: boolean;
  /** Pane sizes in px; a per-viewer convenience persisted in localStorage. */
  ideWidth: number;
  inspectorWidth: number;
  /** height of the inspector when it is docked at the bottom */
  inspectorHeight: number;
  inspectorDock: 'right' | 'bottom';
  consoleHeight: number;
  console: ConsoleLine[];
}

export const LAYOUT_LIMITS = {
  ideWidth: { min: 260, max: 900, initial: 380 },
  inspectorWidth: { min: 300, max: 760, initial: 392 },
  inspectorHeight: { min: 160, max: 900, initial: 320 },
  consoleHeight: { min: 60, max: 600, initial: 150 },
} as const;

type LayoutKey = keyof typeof LAYOUT_LIMITS;
const clampLayout = (k: LayoutKey, v: number) => Math.round(Math.min(LAYOUT_LIMITS[k].max, Math.max(LAYOUT_LIMITS[k].min, v)));

export const LAYOUT_STORAGE_KEY = 'perf-lab:layout';

const storedLayout = (): Partial<Record<LayoutKey | 'ideOpen' | 'inspectorOpen' | 'inspectorDock', number | boolean | string>> => {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
};

let lineId = 0;

const initialTheme = (): UiState['theme'] => {
  try {
    const t = localStorage.getItem('perf-lab:theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState: (() => {
    const stored = storedLayout();
    const wide = typeof window === 'undefined' || window.innerWidth >= 1280;
    const mid = typeof window === 'undefined' || window.innerWidth >= 900;
    return {
      theme: initialTheme(),
      ideOpen: wide && stored.ideOpen !== false,
      inspectorOpen: mid && stored.inspectorOpen !== false,
      ideWidth: clampLayout('ideWidth', Number(stored.ideWidth ?? LAYOUT_LIMITS.ideWidth.initial)),
      inspectorWidth: clampLayout('inspectorWidth', Number(stored.inspectorWidth ?? LAYOUT_LIMITS.inspectorWidth.initial)),
      inspectorHeight: clampLayout('inspectorHeight', Number(stored.inspectorHeight ?? LAYOUT_LIMITS.inspectorHeight.initial)),
      inspectorDock: stored.inspectorDock === 'bottom' ? 'bottom' : 'right',
      consoleHeight: clampLayout('consoleHeight', Number(stored.consoleHeight ?? LAYOUT_LIMITS.consoleHeight.initial)),
      console: [],
    } as UiState;
  })(),
  reducers: {
    setTheme(state, a: PayloadAction<UiState['theme']>) {
      state.theme = a.payload;
    },
    toggleIde(state, a: PayloadAction<boolean | undefined>) {
      state.ideOpen = a.payload ?? !state.ideOpen;
    },
    toggleInspector(state, a: PayloadAction<boolean | undefined>) {
      state.inspectorOpen = a.payload ?? !state.inspectorOpen;
    },
    /** The inspector (with the assistant) as a right sidebar or a bottom bar. */
    setInspectorDock(state, a: PayloadAction<'right' | 'bottom' | undefined>) {
      state.inspectorDock = a.payload ?? (state.inspectorDock === 'right' ? 'bottom' : 'right');
      state.inspectorOpen = true;
    },
    resize(state, a: PayloadAction<{ key: LayoutKey; value: number }>) {
      state[a.payload.key] = clampLayout(a.payload.key, a.payload.value);
    },
    resetSize(state, a: PayloadAction<LayoutKey>) {
      state[a.payload] = LAYOUT_LIMITS[a.payload].initial;
    },
    log: {
      reducer(state, a: PayloadAction<ConsoleLine>) {
        state.console.push(a.payload);
        if (state.console.length > 300) state.console.splice(0, state.console.length - 300);
      },
      prepare(level: ConsoleLine['level'], text: string, line?: number) {
        return { payload: { id: ++lineId, at: Date.now(), level, text, line } };
      },
    },
    clearConsole(state) {
      state.console = [];
    },
  },
});

export const { setTheme, toggleIde, toggleInspector, setInspectorDock, resize, resetSize, log, clearConsole } = uiSlice.actions;
