// Extracts the real-shaped test fixture test/fixtures/local-sampler-q2048.json from Perf Lab's store, read-only:
// the catalog entries and bundles of the local sampler's timing (8 runs) and memory (2 runs) captures at the
// program's default parameters, and the local host report their capture hashes were computed with. Run once, by
// hand (`pnpm --filter @kiln/lab fixtures`); tests read the JSON and never the store.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, labEnv } from '../src/index.ts';
import { readPreset } from '../src/node/index.ts';
import { openPerfLab, PL_DB } from './perf-lab.ts';

const OUT = fileURLToPath(new URL('../test/fixtures/local-sampler-q2048.json', import.meta.url));
const MODES = ['timing', 'memory'];

const { store, local } = openPerfLab();
const { ir } = build({ source: readPreset('local-sampler').source, labId: 'local-sampler', params: {}, env: labEnv(store.data) });
const captures = ir.plan.captures.filter((c) => MODES.includes(c.mode));
const missing = captures.filter((c) => c.status !== 'cached');
if (missing.length) throw new Error(`not in the store: ${missing.map((c) => c.ref).join(', ')}`);

const catalog = store.data.catalog();
const fixture = {
  about:
    'Perf Lab store (lab-workbench/.data/perf-lab.sqlite), read-only, by packages/lab/scripts/extract-fixtures.ts: ' +
    'local-sampler.lab.js at default parameters (queries 2048), timing and memory captures. ' +
    '`catalog` is GET /catalog for these hashes, `bundles` is GET /bundles?hashes=… for them.',
  localReport: local,
  catalog: Object.fromEntries(captures.map((c) => [c.hash, catalog[c.hash]])),
  bundles: Object.fromEntries(captures.map((c) => [c.hash, store.bundles[c.hash] ?? []])),
};
writeFileSync(OUT, `${JSON.stringify(fixture)}\n`);
const runs = Object.values(fixture.bundles).reduce((a, b) => a + b.length, 0);
console.log(`read ${PL_DB}\nwrote ${OUT}: ${captures.length} captures (${captures.map((c) => c.ref).join(', ')}), ${runs} runs`);
