import { rng } from './util.ts';

export interface AlgoSpec {
  __algo: true;
  kind: 'bilinear' | 'weightedReduction' | 'rmsnorm' | 'matmulTiles';
  opts: Record<string, unknown>;
}

export interface WCell {
  id: string;
  label: string;
  value: number | string;
  sub?: string;
}
export interface WGroup {
  id: string;
  label: string;
  cols: number;
  cells: WCell[];
}
export interface WStep {
  title: string;
  detail: string;
  highlight: string[];
}
export interface Walkthrough {
  title: string;
  formula: string;
  groups: WGroup[];
  steps: WStep[];
  result: { label: string; value: string };
  notes: string[];
  counters?: { label: string; value: string }[];
}

const r6 = (x: number) => Number(x.toPrecision(6));

export const algo = {
  bilinear: (opts: Record<string, unknown>): AlgoSpec => ({ __algo: true, kind: 'bilinear', opts }),
  weightedReduction: (opts: Record<string, unknown> = {}): AlgoSpec => ({ __algo: true, kind: 'weightedReduction', opts }),
  rmsnorm: (opts: Record<string, unknown>): AlgoSpec => ({ __algo: true, kind: 'rmsnorm', opts }),
  matmulTiles: (opts: Record<string, unknown>): AlgoSpec => ({ __algo: true, kind: 'matmulTiles', opts }),
};

export const isAlgo = (x: unknown): x is AlgoSpec => typeof x === 'object' && x !== null && (x as AlgoSpec).__algo === true;

/** Deterministic educational walkthroughs. Every value here is illustrative, never recovered GPU state. */
export function walkthrough(kind: AlgoSpec['kind'], o: Record<string, unknown>, mode?: string): Walkthrough {
  switch (kind) {
    case 'bilinear':
      return bilinear(o);
    case 'weightedReduction':
      return weightedReduction(o, mode ?? 'unfused');
    case 'rmsnorm':
      return rmsnorm(o);
    case 'matmulTiles':
      return matmulTiles(o);
  }
}

function bilinear(o: Record<string, unknown>): Walkthrough {
  const v = (o.v as number[][]) ?? [
    [2, 6],
    [10, 14],
  ];
  const a = Number(o.a ?? 0.25);
  const b = Number(o.b ?? 0.5);
  const [v00 = 0, v10 = 0] = v[0] ?? [];
  const [v01 = 0, v11 = 0] = v[1] ?? [];
  const w = { w00: (1 - a) * (1 - b), w10: a * (1 - b), w01: (1 - a) * b, w11: a * b };
  const p = { p00: w.w00 * v00, p10: w.w10 * v10, p01: w.w01 * v01, p11: w.w11 * v11 };
  const out = p.p00 + p.p10 + p.p01 + p.p11;
  return {
    title: 'Bilinear sampling at one point',
    formula: 'v=(1-a)(1-b)\\,v_{00}+a(1-b)\\,v_{10}+(1-a)\\,b\\,v_{01}+ab\\,v_{11}',
    groups: [
      {
        id: 'reads',
        label: 'Neighbour reads',
        cols: 2,
        cells: [
          { id: 'v00', label: '$v_{00}$', value: v00, sub: '$(x_0, y_0)$' },
          { id: 'v10', label: '$v_{10}$', value: v10, sub: '$(x_1, y_0)$' },
          { id: 'v01', label: '$v_{01}$', value: v01, sub: '$(x_0, y_1)$' },
          { id: 'v11', label: '$v_{11}$', value: v11, sub: '$(x_1, y_1)$' },
        ],
      },
      {
        id: 'weights',
        label: 'Weights',
        cols: 2,
        cells: [
          { id: 'w00', label: '$(1-a)(1-b)$', value: r6(w.w00) },
          { id: 'w10', label: '$a(1-b)$', value: r6(w.w10) },
          { id: 'w01', label: '$(1-a)b$', value: r6(w.w01) },
          { id: 'w11', label: '$ab$', value: r6(w.w11) },
        ],
      },
      {
        id: 'products',
        label: 'Products',
        cols: 2,
        cells: [
          { id: 'p00', label: '$w_{00}v_{00}$', value: r6(p.p00) },
          { id: 'p10', label: '$w_{10}v_{10}$', value: r6(p.p10) },
          { id: 'p01', label: '$w_{01}v_{01}$', value: r6(p.p01) },
          { id: 'p11', label: '$w_{11}v_{11}$', value: r6(p.p11) },
        ],
      },
      { id: 'sum', label: 'Output', cols: 1, cells: [{ id: 'out', label: '$v$', value: r6(out) }] },
    ],
    steps: [
      { title: 'Read the four neighbours', detail: `$x_0=\\lfloor x\\rfloor$, $y_0=\\lfloor y\\rfloor$; offsets $a=${a}$, $b=${b}$.`, highlight: ['v00', 'v10', 'v01', 'v11'] },
      { title: 'Compute the weights', detail: 'Weights sum to 1 for an interior point.', highlight: ['w00', 'w10', 'w01', 'w11'] },
      { title: 'Multiply', detail: 'One product per neighbour.', highlight: ['p00', 'p10', 'p01', 'p11'] },
      { title: 'Sum', detail: `$v=${r6(out)}$.`, highlight: ['out'] },
    ],
    result: { label: 'v', value: String(r6(out)) },
    notes: [
      'Interior point only: boundary handling and normalized-coordinate conversion come from the real implementation.',
      'Illustrative values; not recovered GPU register state.',
    ],
  };
}

function weightedReduction(o: Record<string, unknown>, mode: string): Walkthrough {
  const L = Number(o.levels ?? 4);
  const P = Number(o.points ?? 4);
  const r = rng(`wr:${L}:${P}`);
  const cells: WCell[] = [];
  const wcells: WCell[] = [];
  let acc = 0;
  const raw: number[] = [];
  for (let l = 0; l < L; l++) for (let p = 0; p < P; p++) raw.push(0.2 + r.next());
  const total = raw.reduce((a, b) => a + b, 0);
  let i = 0;
  for (let l = 0; l < L; l++) {
    for (let p = 0; p < P; p++) {
      const v = Math.round(r.range(-4, 9) * 10) / 10;
      const w = raw[i]! / total;
      acc += v * w;
      cells.push({ id: `v${l}${p}`, label: `$v_{${l}${p}}$`, value: v });
      wcells.push({ id: `w${l}${p}`, label: `$w_{${l}${p}}$`, value: r6(w) });
      i++;
    }
  }
  const fused = mode === 'fused';
  return {
    title: fused ? 'Weighted reduction, fused' : 'Weighted reduction, unfused',
    formula: 'o=\\sum_{l=1}^{L}\\sum_{p=1}^{P} w_{lp}\\,v_{lp}',
    groups: [
      { id: 'samples', label: fused ? 'Samples held for the reduction' : 'Sampled intermediate (global memory)', cols: P, cells },
      { id: 'weights', label: 'Attention weights', cols: P, cells: wcells },
      { id: 'out', label: 'Output', cols: 1, cells: [{ id: 'o', label: '$o$', value: r6(acc) }] },
    ],
    steps: fused
      ? [
          { title: 'Sample and accumulate', detail: 'Each sample is multiplied into the accumulator as it is produced.', highlight: cells.map((c) => c.id) },
          { title: 'Write the output', detail: 'Only the output reaches global memory.', highlight: ['o'] },
        ]
      : [
          { title: 'Sample into the intermediate', detail: `${L * P} values written to global memory.`, highlight: cells.map((c) => c.id) },
          { title: 'Read back and weight', detail: `${L * P} values read again by the reduction kernel.`, highlight: wcells.map((c) => c.id) },
          { title: 'Write the output', detail: 'The reduction writes one value.', highlight: ['o'] },
        ],
    result: { label: 'o', value: String(r6(acc)) },
    counters: [
      { label: 'global writes of samples', value: fused ? '0' : String(L * P) },
      { label: 'global reads of samples', value: fused ? '0' : String(L * P) },
    ],
    notes: [
      'Shows which global stores and loads disappear; it does not claim every sample stays in a physical register.',
      'Reduction order in the audited fusion follows the generated code, not this illustration.',
    ],
  };
}

function rmsnorm(o: Record<string, unknown>): Walkthrough {
  const x = (o.x as number[]) ?? [1, 2, 3, 4];
  const eps = Number(o.eps ?? 0);
  const w = (o.w as number[]) ?? x.map(() => 1);
  const f = Math.fround;
  const squares = x.map((v) => f(f(v) * f(v)));
  let level = squares.slice();
  const tree: WCell[] = [];
  let depth = 0;
  while (level.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const s = i + 1 < level.length ? f(level[i]! + level[i + 1]!) : level[i]!;
      next.push(s);
      tree.push({ id: `t${depth}_${i / 2}`, label: `level ${depth + 1}`, value: r6(s) });
    }
    level = next;
    depth++;
  }
  const sum = level[0]!;
  const m = f(sum / x.length);
  const rs = f(1 / Math.sqrt(m + eps));
  const y = x.map((v, i) => f(f(v * rs) * w[i]!));
  return {
    title: 'RMSNorm on one row',
    formula: 'm=\\frac{1}{C}\\sum_{i=1}^{C}x_i^2,\\qquad r=(m+\\epsilon)^{-1/2},\\qquad y_i=x_i\\,r\\,w_i',
    groups: [
      { id: 'x', label: 'x (cast to fp32)', cols: x.length, cells: x.map((v, i) => ({ id: `x${i}`, label: `$x_{${i}}$`, value: v })) },
      { id: 'sq', label: 'x² (fp32)', cols: x.length, cells: squares.map((v, i) => ({ id: `s${i}`, label: `$x_{${i}}^2$`, value: r6(v) })) },
      { id: 'tree', label: 'Pairwise reduction tree', cols: Math.max(1, tree.length), cells: tree },
      {
        id: 'scale',
        label: 'Mean and scale',
        cols: 2,
        cells: [
          { id: 'm', label: '$m$', value: r6(m) },
          { id: 'r', label: '$r$', value: r6(rs) },
        ],
      },
      { id: 'y', label: 'y', cols: x.length, cells: y.map((v, i) => ({ id: `y${i}`, label: `$y_{${i}}$`, value: r6(v) })) },
    ],
    steps: [
      { title: 'Cast and square', detail: 'Inputs are converted to fp32 before accumulation.', highlight: x.map((_, i) => `s${i}`) },
      { title: 'Reduce', detail: 'Pairwise tree; a different order can change low-order bits.', highlight: tree.map((c) => c.id) },
      { title: 'Mean and reciprocal square root', detail: `$m=${r6(m)}$, $r=(m+\\epsilon)^{-1/2}=${r6(rs)}$.`, highlight: ['m', 'r'] },
      { title: 'Scale', detail: 'Multiply by r and the weight, then cast to the output type.', highlight: y.map((_, i) => `y${i}`) },
    ],
    result: { label: 'r', value: String(r6(rs)) },
    notes: ['Teaches the formula; the reduction order shown is illustrative unless the stepper names a pinned source order.'],
  };
}

function matmulTiles(o: Record<string, unknown>): Walkthrough {
  const M = Number(o.M ?? 128);
  const N = Number(o.N ?? 128);
  const K = Number(o.K ?? 64);
  const t = Number(o.tile ?? 32);
  const tm = Math.ceil(M / t);
  const tn = Math.ceil(N / t);
  const flops = 2 * M * N * K;
  const naive = 2 * M * N * K;
  const tiled = Math.round((tm * tn * 2 * t * K));
  const cells: WCell[] = [];
  for (let i = 0; i < tm; i++) for (let j = 0; j < tn; j++) cells.push({ id: `c${i}_${j}`, label: `C[${i},${j}]`, value: `${t}×${t}` });
  return {
    title: 'Tiled matrix multiplication',
    formula: 'C=AB,\\quad A\\in\\mathbb{R}^{M\\times K},\\; B\\in\\mathbb{R}^{K\\times N},\\quad \\approx 2MNK\\ \\text{operations}',
    groups: [{ id: 'tiles', label: `Output tiles (${tm}×${tn})`, cols: tn, cells }],
    steps: cells.slice(0, Math.min(cells.length, 6)).map((c, idx) => ({
      title: `Tile ${idx + 1}`,
      detail: `Load a $${t}\\times ${K}$ slice of $A$ and a $${K}\\times ${t}$ slice of $B$, accumulate $${t}\\times ${t}$ outputs.`,
      highlight: [c.id],
    })),
    result: { label: 'reuse', value: `${t}×` },
    counters: [
      { label: 'operations (2MNK)', value: flops.toLocaleString('en-US') },
      { label: 'element loads, untiled', value: naive.toLocaleString('en-US') },
      { label: 'element loads, tiled', value: tiled.toLocaleString('en-US') },
      { label: 'intensity (fp16, tiled)', value: `${(flops / (tiled * 2)).toFixed(1)} op/B` },
    ],
    notes: ['A model of reuse, not a measurement: changing the tile size here predicts nothing until a real kernel runs.'],
  };
}
