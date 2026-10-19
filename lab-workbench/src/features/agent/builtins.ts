import type { IR } from '@/lang/ir';

/** The workbench's one assistant. Programs do not declare agents; this policy is fixed by the workbench. */
export const ASSISTANT = {
  name: 'assistant',
  can: ['read evidence', 'annotate hypotheses', 'move the view', 'set parameters', 'plan', 'propose runs'],
  /** Run proposals are bounded and always wait for a person to approve them. */
  run: { budgetGpuMin: 30, approval: 'human' as const },
};

export interface BuiltinReply {
  prompt: string;
  text: string;
  code: string;
  /** Shown only where it is a real action on the current board. */
  applies: (ir: IR, boardId: string, ctx: { pending: boolean }) => boolean;
}

const board = (ir: IR, id: string) => ir.boards.find((b) => b.id === id);

/** Scripted prompts that work on any board; each preset may add board-specific ones in its replies file. */
export const BUILTIN_REPLIES: BuiltinReply[] = [
  {
    prompt: 'Which runs on this board are invalid, and why?',
    text: 'Checking the validity record of every run behind this board.',
    applies: (ir, id) => Boolean(board(ir, id)?.experiments.length),
    code: `const runs = self.runs();
const invalid = runs.filter(r => !r.validity.ok);
log(\`\${runs.length} runs behind this board, \${invalid.length} invalid\`);
return invalid.map(r => ({ run: r.ref, why: r.validity.reasons.join('; ') }));`,
  },
  {
    prompt: 'What evidence is missing on this board?',
    text: 'Collecting coverage gaps, kernels without source, and captures that have not run.',
    applies: (ir, id) => Boolean(board(ir, id)?.experiments.length),
    code: `const runs = self.runs();
const gaps = [];
for (const r of runs) {
  for (const g of r.coverage.trace.lost) gaps.push({ run: r.ref, gap: \`trace lost \${g.from}–\${g.to} s\`, reason: g.reason });
  for (const m of r.coverage.links.missing) gaps.push({ run: r.ref, gap: \`\${m.count} \${m.rel} links missing\`, reason: m.reason });
}
const withoutSource = [...new Set(runs.flatMap(r => r.coverage.source.missing.map(m => m.code)))];
const notRun = lab.plan.captures.filter(c => c.status !== 'cached' && self.experiments.includes(c.experiment)).map(c => \`\${c.ref} (\${c.status})\`);
return { gaps, kernelsWithoutSource: withoutSource, capturesNotRun: notRun, pendingPlan: lab.plan.pending?.changes ?? null };`,
  },
  {
    prompt: "Explain this board's parameters",
    text: 'Listing each parameter with its binding and what changing it costs.',
    applies: (ir, id) => Boolean(board(ir, id)?.paramKeys.length),
    code: `const cost = { view: 're-renders the views', data: 'recomputes derived rows', plan: 'needs new runs — it becomes a pending plan' };
return Object.entries(self.params.describe()).map(([key, p]) =>
  \`\${key} = \${JSON.stringify(p.value)} · \${p.binding.toUpperCase()}: changing it \${cost[p.binding]}\`);`,
  },
  {
    prompt: 'What would run if I executed the plan?',
    text: 'Reading the plan: pending parameter changes first, then captures the program declares but has not run.',
    applies: (ir, _id, ctx) => ctx.pending || ir.plan.execute + ir.plan.blocked > 0,
    code: `const p = lab.plan;
const rows = (p.pending ? p.pending.captures : p.captures.filter(c => c.status !== 'cached'))
  .map(c => ({ capture: c.ref, status: c.status, runs: c.reps, host: c.host, gpuMin: c.estimateGpuMin }));
const total = rows.reduce((a, r) => a + r.gpuMin, 0);
log(\`\${rows.length} captures, ≈ \${total.toFixed(1)} gpu-min (synthetic estimate)\`);
return { pending: p.pending?.changes ?? [], rows };`,
  },
];
