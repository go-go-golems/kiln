import compare from './programs/compare.lab.js?raw';
import dinoPr1005 from './programs/dino-pr1005.lab.js?raw';
import hello from './programs/hello.lab.js?raw';
import learn from './programs/learn.lab.js?raw';
import localSampler from './programs/local-sampler.lab.js?raw';
import matrices from './programs/matrices.lab.js?raw';
import parameters from './programs/parameters.lab.js?raw';
import requestToKernel from './programs/request-to-kernel.lab.js?raw';
import scenarioA from './programs/scenario-a.lab.js?raw';
import scenarioARepliesText from './programs/scenario-a.replies.txt?raw';
import scenarioB from './programs/scenario-b.lab.js?raw';
import scenarioC from './programs/scenario-c.lab.js?raw';
import scenarioCRepliesText from './programs/scenario-c.replies.txt?raw';

export interface Preset {
  id: string;
  name: string;
  group: 'Basics' | 'Parameters' | 'Evidence' | 'Learning' | 'Plans' | 'Scenarios' | 'Assistant' | 'Measured';
  description: string;
  /** 1–5, shown as a meter in the picker. */
  complexity: number;
  source: string;
  replies: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'hello',
    name: 'Hello, Perf Lab',
    group: 'Basics',
    description: 'The smallest program: one experiment, one derive, one board. Three lints say what the contract is missing.',
    complexity: 1,
    source: hello,
    replies: '',
  },
  {
    id: 'parameters',
    name: 'Parameters',
    group: 'Parameters',
    description: 'Every parameter kind, and the three bindings: VIEW re-renders, DATA recomputes, PLAN becomes a pending plan.',
    complexity: 2,
    source: parameters,
    replies: '',
  },
  {
    id: 'request-to-kernel',
    name: 'Request to kernel',
    group: 'Evidence',
    description: 'A run picker, a timeline and a route from one request to its kernel, its source and its operation, with evidence per hop.',
    complexity: 3,
    source: requestToKernel,
    replies: '',
  },
  {
    id: 'compare',
    name: 'Compare runs',
    group: 'Evidence',
    description: 'Manifest diff, a paired estimate over processes, and a mirror of two traces joined by structural correspondence.',
    complexity: 3,
    source: compare,
    replies: '',
  },
  {
    id: 'learn',
    name: 'Learn the math',
    group: 'Learning',
    description: 'Illustrative walkthroughs of bilinear sampling, the fused reduction, RMSNorm and tiling, driven by parameters.',
    complexity: 2,
    source: learn,
    replies: '',
  },
  {
    id: 'matrices',
    name: 'Matrices and plans',
    group: 'Plans',
    description: 'matrix() and when() expand an ablation and an interference study; a custom collector lowers to the runner.',
    complexity: 4,
    source: matrices,
    replies: '',
  },
  {
    id: 'scenario-a',
    name: 'Scenario A · sampled intermediate',
    group: 'Scenarios',
    description: 'Logical traffic, measured traffic and retained allocation for the DINO fusion, with a hypothesis the assistant can test.',
    complexity: 5,
    source: scenarioA,
    replies: scenarioARepliesText,
  },
  {
    id: 'scenario-b',
    name: 'Scenario B · layout churn',
    group: 'Scenarios',
    description: 'Embedding graph-cache captures and evictions under an open-loop offer, in requests and windows.',
    complexity: 4,
    source: scenarioB,
    replies: '',
  },
  {
    id: 'scenario-c',
    name: 'Scenario C · incomplete evidence',
    group: 'Assistant',
    description: 'A lost trace interval and missing symbols; the assistant states what holds and plans a re-trace a person approves.',
    complexity: 5,
    source: scenarioC,
    replies: scenarioCRepliesText,
  },
  {
    id: 'local-sampler',
    name: 'Local · measured sampler',
    group: 'Measured',
    description: 'Real runs on this machine through the lab server: eager grid_sample against TorchInductor, timing, trace, allocator and CPU evidence.',
    complexity: 3,
    source: localSampler,
    replies: '',
  },
  {
    id: 'dino-pr1005',
    name: 'PR 1005 · Grounding DINO on the DGX',
    group: 'Measured',
    description: 'The PR’s DGX qualification evidence imported from its archive: paired latency, memory pools, stages, kernels, native tests, prompt reuse, and every recorded detection drawn on its image.',
    complexity: 4,
    source: dinoPr1005,
    replies: '',
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
