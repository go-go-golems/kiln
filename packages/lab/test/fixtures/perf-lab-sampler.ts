// The local sampler as Perf Lab measured it, on its host 'local'. The program names Kiln hosts through its Host
// parameter, and the host is part of every capture's hash, so the runs in local-sampler-q2048.json (stored by Perf
// Lab under those hashes) are found only with that host restored.
import { readPreset } from '../../src/node/index.ts';

const KILN_HOST = ".host(ctx => ctx.param('host'))";
const source = readPreset('local-sampler').source;
if (!source.includes(KILN_HOST)) throw new Error(`local-sampler.lab.js no longer declares ${KILN_HOST}: update this fixture`);

export const PERF_LAB_SAMPLER = source.replace(KILN_HOST, ".host('local')");
