// Done-condition check for Phase 8a (not a test): build Perf Lab's two measured programs with @kiln/lab against Perf
// Lab's own store and print every derive (abridged) and every hypothesis verdict with its rows.
//
//   pnpm --filter @kiln/lab check:pl            (KILN_PL_DB=<path> to read another copy of the store)
//
// The store is read from a temporary copy opened read-only (readPerfLabStore); nothing under lab-workbench/.data is
// opened by SQLite or written. Host `local`'s probe report is reconstructed (scripts/perf-lab.ts).
import { build, BuildError, evaluateHypothesis, fmtNumber, isEnt, isValue, labEnv, readDerive, type RuntimeState, type Value } from '../src/index.ts';
import { readPreset } from '../src/node/index.ts';
import { openPerfLab, PL_DB } from './perf-lab.ts';

const PROGRAMS = ['local-sampler', 'dino-pr1005'];
const MAX_ROWS = 8;
const MAX_FIELDS = 10;
const MAX_TEXT = 72;

const clip = (s: string, n = MAX_TEXT) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function value(v: Value): string {
  if (v.value === null) return `missing (${v.reason ?? 'no reason'})`;
  const x = typeof v.value === 'number' ? fmtNumber(v.value, 5) : String(v.value);
  return `${x}${v.unit ? ` ${v.unit}` : ''} [${v.prov}]`;
}

function cell(x: unknown, depth = 0): string {
  if (isValue(x)) return value(x);
  if (isEnt(x)) return `<${x.ref}>`;
  if (x === null || x === undefined) return String(x);
  if (typeof x === 'number') return fmtNumber(x, 5);
  if (typeof x === 'string') return JSON.stringify(clip(x, 48));
  if (typeof x !== 'object') return String(x);
  if (Array.isArray(x)) return depth > 0 || x.length > 4 ? `[${x.length} items]` : `[${x.map((y) => cell(y, depth + 1)).join(', ')}]`;
  if (depth > 0) return '{…}';
  const entries = Object.entries(x);
  return `{ ${entries.slice(0, 4).map(([k, v]) => `${k}: ${cell(v, depth + 1)}`).join(', ')}${entries.length > 4 ? ', …' : ''} }`;
}

const row = (r: unknown): string => {
  if (!r || typeof r !== 'object' || isValue(r) || isEnt(r) || Array.isArray(r)) return cell(r);
  const entries = Object.entries(r);
  const shown = entries.slice(0, MAX_FIELDS).map(([k, v]) => `${k}=${cell(v)}`);
  return clip(shown.join('  ') + (entries.length > MAX_FIELDS ? `  (+${entries.length - MAX_FIELDS} fields)` : ''), 400);
};

function printDerive(name: string, result: unknown) {
  if (result && typeof result === 'object' && (result as { __estimate?: unknown }).__estimate === true) {
    const e = result as { estimator: string; median: Value; ci: [Value, Value]; level: number; n: number; note: string; caveat: string | null; seed: unknown; pairs: { rep: number; baseline: number; candidate: number; ratio: number }[]; excluded: { rep: number; arm: string; reason: string }[] };
    console.log(`  derive ${name}: ${e.estimator} median ${value(e.median)}, ${Math.round(e.level * 100)} % CI [${value(e.ci[0])}, ${value(e.ci[1])}], n = ${e.n}`);
    console.log(`    ${e.note}${e.caveat ? ` · caveat: ${e.caveat}` : ''} · seed ${String(e.seed)}`);
    for (const p of e.pairs) console.log(`    rep ${p.rep}: baseline ${fmtNumber(p.baseline, 5)}  candidate ${fmtNumber(p.candidate, 5)}  ratio ${fmtNumber(p.ratio, 5)}`);
    for (const x of e.excluded) console.log(`    excluded rep ${x.rep} (${x.arm}): ${x.reason}`);
    return;
  }
  if (Array.isArray(result)) {
    console.log(`  derive ${name}: ${result.length} row${result.length === 1 ? '' : 's'}`);
    for (const r of result.slice(0, MAX_ROWS)) console.log(`    ${row(r)}`);
    if (result.length > MAX_ROWS) console.log(`    … ${result.length - MAX_ROWS} more`);
    return;
  }
  console.log(`  derive ${name}: ${row(result)}`);
}

const { store, local } = openPerfLab();
console.log(`Perf Lab store: ${PL_DB} (read from a temporary copy, read-only)`);
console.log(`  ${Object.entries(store.counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
console.log(`  host local: reconstructed probe report, tools.workloads = ${local.tools.workloads}`);

const env = labEnv(store.data);
const state: RuntimeState = { params: {}, signals: {} };
let failed = false;
for (const id of PROGRAMS) {
  console.log(`\n═══ ${id} ═══`);
  let out;
  try {
    out = build({ source: readPreset(id).source, labId: id, params: {}, env });
  } catch (e) {
    failed = true;
    console.log(`  build failed: ${e instanceof BuildError ? e.failure.message : String(e)}`);
    continue;
  }
  const { ir, registry } = out;
  const by = (s: string) => ir.plan.captures.filter((c) => c.status === s).length;
  console.log(`  plan: ${ir.plan.captures.length} captures — ${by('cached')} cached, ${by('execute')} execute, ${by('import')} import, ${by('blocked')} blocked`);
  for (const c of ir.plan.captures.filter((x) => x.status !== 'cached')) console.log(`    ${c.status} ${c.ref} ${c.hash}${c.blockedOn ? ` (${c.blockedOn})` : ''}`);
  const lint = ir.lint.filter((l) => l.level !== 'info');
  console.log(`  lint: ${lint.length ? lint.map((l) => `${l.level} ${l.code}`).join(', ') : 'none'}`);
  for (const d of registry.lab.derives) {
    try {
      printDerive(d.name, readDerive(registry, d.name, state));
    } catch (e) {
      failed = true;
      console.log(`  derive ${d.name}: error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const h of registry.lab.hypotheses) {
    const v = evaluateHypothesis(registry, state, h.id);
    console.log(`  hypothesis ${h.id}: ${v.verdict.toUpperCase()}`);
    console.log(`    claim: ${clip(v.claim, 160)}`);
    for (const r of v.reasons) console.log(`    reason: ${r}`);
    v.checks.forEach((c, i) => console.log(`    row ${i} ${c.pass === true ? 'holds ' : c.pass === false ? 'fails ' : 'undecided'}${c.missing.length ? ` (missing ${c.missing.join(', ')})` : ''}${c.error ? ` (threw: ${c.error})` : ''}: ${row(c.row)}`));
    for (const s of v.support) console.log(`    support ${clip(s.describe, 80)}: ${s.count} rows, ${s.runs.length} runs${s.invalid.length ? `, invalid: ${s.invalid.join(', ')}` : ''}`);
  }
}
process.exitCode = failed ? 1 : 0;
