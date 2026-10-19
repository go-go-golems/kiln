// The example lab programs, copied unmodified from Perf Lab (PL/src/presets/programs/) into packages/lab/presets/.
// Perf Lab bundled their sources with Vite `?raw` imports; this module only lists them, so it stays free of bundler
// and Node specifics. A Vite app imports a source as `@kiln/lab/presets/<file>?raw`; Node reads it with
// `readPresets()` from `@kiln/lab/node`.

export type PresetGroup = 'Basics' | 'Parameters' | 'Evidence' | 'Learning' | 'Plans' | 'Scenarios' | 'Assistant' | 'Measured';

export interface PresetInfo {
  id: string;
  name: string;
  group: PresetGroup;
  description: string;
  /** 1–5, shown as a meter in the picker */
  complexity: number;
  /** the program, under packages/lab/presets/ */
  file: string;
  /** the scripted assistant replies of a scenario, under packages/lab/presets/ */
  repliesFile?: string;
}

/** A preset with its texts loaded. */
export interface Preset extends PresetInfo {
  source: string;
  replies: string;
}

export const PRESET_INFO: readonly PresetInfo[] = [
  {
    id: 'hello',
    name: 'Hello, Perf Lab',
    group: 'Basics',
    description: 'The smallest program: one experiment, one derive, one board. Three lints say what the contract is missing.',
    complexity: 1,
    file: 'hello.lab.js',
  },
  {
    id: 'parameters',
    name: 'Parameters',
    group: 'Parameters',
    description: 'Every parameter kind, and the three bindings: VIEW re-renders, DATA recomputes, PLAN becomes a pending plan.',
    complexity: 2,
    file: 'parameters.lab.js',
  },
  {
    id: 'request-to-kernel',
    name: 'Request to kernel',
    group: 'Evidence',
    description: 'A run picker, a timeline and a route from one request to its kernel, its source and its operation, with evidence per hop.',
    complexity: 3,
    file: 'request-to-kernel.lab.js',
  },
  {
    id: 'compare',
    name: 'Compare runs',
    group: 'Evidence',
    description: 'Manifest diff, a paired estimate over processes, and a mirror of two traces joined by structural correspondence.',
    complexity: 3,
    file: 'compare.lab.js',
  },
  {
    id: 'learn',
    name: 'Learn the math',
    group: 'Learning',
    description: 'Illustrative walkthroughs of bilinear sampling, the fused reduction, RMSNorm and tiling, driven by parameters.',
    complexity: 2,
    file: 'learn.lab.js',
  },
  {
    id: 'matrices',
    name: 'Matrices and plans',
    group: 'Plans',
    description: 'matrix() and when() expand an ablation and an interference study; a custom collector lowers to the runner.',
    complexity: 4,
    file: 'matrices.lab.js',
  },
  {
    id: 'scenario-a',
    name: 'Scenario A · sampled intermediate',
    group: 'Scenarios',
    description: 'Logical traffic, measured traffic and retained allocation for the DINO fusion, with a hypothesis the assistant can test.',
    complexity: 5,
    file: 'scenario-a.lab.js',
    repliesFile: 'scenario-a.replies.txt',
  },
  {
    id: 'scenario-b',
    name: 'Scenario B · layout churn',
    group: 'Scenarios',
    description: 'Embedding graph-cache captures and evictions under an open-loop offer, in requests and windows.',
    complexity: 4,
    file: 'scenario-b.lab.js',
  },
  {
    id: 'scenario-c',
    name: 'Scenario C · incomplete evidence',
    group: 'Assistant',
    description: 'A lost trace interval and missing symbols; the assistant states what holds and plans a re-trace a person approves.',
    complexity: 5,
    file: 'scenario-c.lab.js',
    repliesFile: 'scenario-c.replies.txt',
  },
  {
    id: 'local-sampler',
    name: 'Local · measured sampler',
    group: 'Measured',
    description: 'Real runs on this machine through the lab server: eager grid_sample against TorchInductor, timing, trace, allocator and CPU evidence.',
    complexity: 3,
    file: 'local-sampler.lab.js',
  },
  {
    id: 'dino-pr1005',
    name: 'PR 1005 · Grounding DINO on the DGX',
    group: 'Measured',
    description: 'The PR’s DGX qualification evidence imported from its archive: paired latency, memory pools, stages, kernels, native tests, prompt reuse, and every recorded detection drawn on its image.',
    complexity: 4,
    file: 'dino-pr1005.lab.js',
  },
];

export const presetInfo = (id: string) => PRESET_INFO.find((p) => p.id === id);
