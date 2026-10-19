#!/usr/bin/env node
// Test-only stand-in for runner/kiln_runner.py (the guide's FakeRunnerExecutor, §30.5): the same command line and
// the same kiln-bundle/1 → kiln-results/1 protocol, with deterministic numbers instead of a GPU. The server's tests
// run it through the real CudaRunnerExecutor, so spawning, stdin, stdout, stderr and killing are all exercised.
//
//   node fake-runner.mjs device
//   node fake-runner.mjs run - --out - [--exit-on-eof]
//
// Behaviour comes from the environment (the executor's `env`):
//   KILN_FAKE_DEVICE      JSON device report (default: a fake Hopper)
//   KILN_FAKE_TIMES       JSON { "<name>|<row>" | "<row>" | "<name>": µs } per-launch time (default from the name)
//   KILN_FAKE_OUTPUTS     path of a JSON file { "<name>|<row>" | "<name>": [value per sample index] }
//                         (default: fround(sin(index)) at every sample index)
//   KILN_FAKE_FAIL        kernel name that reports an error in every repetition
//   KILN_FAKE_COUNTER     path of a file counting invocations (1, 2, …), for the two below
//   KILN_FAKE_EXIT_AT     invocation number that exits with status 3 and a message on stderr
//   KILN_FAKE_DELAY_MS    sleep this long before answering …
//   KILN_FAKE_DELAY_FROM  … from this invocation number on (default 1)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const env = process.env;
const [cmd, ...rest] = process.argv.slice(2);
const DEVICE = env.KILN_FAKE_DEVICE ? JSON.parse(env.KILN_FAKE_DEVICE) : { name: 'Fake H100', cc: '9.0', sms: 132, driver: 12080, driverVersion: '580.00-fake', persistenceMode: 'Enabled', maxSmClockMHz: 1980, maxMemClockMHz: 2619 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stderr.write(s + '\n');

function invocation() {
  if (!env.KILN_FAKE_COUNTER) return 1;
  const n = (existsSync(env.KILN_FAKE_COUNTER) ? Number(readFileSync(env.KILN_FAKE_COUNTER, 'utf8')) : 0) + 1;
  writeFileSync(env.KILN_FAKE_COUNTER, String(n));
  return n;
}

function readBundle() {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (s) => {
      buf += s;
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      process.stdin.off('data', onData);
      try { resolve(JSON.parse(buf.slice(0, nl))); } catch (e) { reject(e); }
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}

const lookup = (map, k) => map?.[`${k.name}|${k.row}`] ?? map?.[k.row] ?? map?.[k.name];
const baseTime = (name) => 5 + ([...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 4000) / 100;

if (cmd === 'device') {
  process.stdout.write(JSON.stringify(DEVICE) + '\n');
} else if (cmd === 'run' && rest[0] === '-') {
  const n = invocation();
  const bundle = await readBundle();
  if (rest.includes('--exit-on-eof')) process.stdin.on('end', () => process.exit(143)).resume();
  if (bundle.format !== 'kiln-bundle/1') { log('not a kiln bundle'); process.exit(2); }
  if (env.KILN_FAKE_EXIT_AT && n === Number(env.KILN_FAKE_EXIT_AT)) { log(`fake runner: invocation ${n} fails`); process.exit(3); }
  if (env.KILN_FAKE_DELAY_MS && n >= Number(env.KILN_FAKE_DELAY_FROM ?? 1)) await sleep(Number(env.KILN_FAKE_DELAY_MS));
  const times = env.KILN_FAKE_TIMES ? JSON.parse(env.KILN_FAKE_TIMES) : null;
  const outputs = env.KILN_FAKE_OUTPUTS ? JSON.parse(readFileSync(env.KILN_FAKE_OUTPUTS, 'utf8')) : null;
  const kernels = bundle.kernels.map((k) => {
    if (k.name === env.KILN_FAKE_FAIL) { log(`  ${k.name} ERROR fake failure`); return { name: k.name, identity: k.identity, error: 'fake failure\nnvcc said no' }; }
    const t = lookup(times, k) ?? baseTime(k.name);
    const us_all = Array.from({ length: bundle.reps }, (_, j) => +(t * (1 + 0.01 * (((j * 7 + n) % 5) - 2))).toFixed(4));
    const samples = lookup(outputs, k) ?? k.samples.map((i) => Math.fround(Math.sin(i)));
    const sorted = [...us_all].sort((a, b) => a - b);
    log(`  ${k.name.padEnd(36)} ${t.toFixed(2)} us`);
    return { name: k.name, identity: k.identity, us_median: sorted[sorted.length >> 1], us_min: sorted[0], us_all, samples, regs: 32 };
  });
  process.stdout.write(JSON.stringify({ format: 'kiln-results/1', device: DEVICE, kernels, runner: 'fake_runner/1', created: new Date().toISOString() }));
  process.exit(0);
} else {
  log(`usage: fake-runner.mjs device | run - --out - [--exit-on-eof]`);
  process.exit(2);
}
