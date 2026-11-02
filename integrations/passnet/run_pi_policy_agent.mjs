import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createPolicySession } from './pi_policy_session.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
mkdirSync(config.output, { recursive: false });
writeFileSync(`${config.output}/config.json`, JSON.stringify(config, null, 2));
const started = performance.now();
const record = (kind, value) => appendFileSync(`${config.output}/events.jsonl`,
  JSON.stringify({ elapsedMs: performance.now() - started, kind, value }) + '\n');
const child = spawn(config.python, [fileURLToPath(new URL('./native_policy_rpc.py', import.meta.url)),
  '--manifest', config.manifest, '--receipt', config.receipt, '--output', `${config.output}/task`,
  '--proposal-budget', String(config.proposalBudget), '--node', process.execPath],
  { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', data => appendFileSync(`${config.output}/rpc.stderr.txt`, data));
let failure;
child.on('error', error => { failure = error; });
child.stdin.on('error', error => { failure = error; });
const exited = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
let serial = Promise.resolve();
let sequence = 0;
const call = (tool, args) => {
  const next = serial.then(async () => {
    if (failure) throw failure;
    const id = String(++sequence);
    record('tool_request', { id, tool, arguments: args });
    child.stdin.write(JSON.stringify({ id, tool, arguments: args }) + '\n');
    const line = await lines.next();
    if (line.done) throw new Error('Policy RPC exited before response');
    const response = JSON.parse(line.value);
    if (response.id !== id) throw new Error('Policy RPC response ID mismatch');
    record('tool_response', response);
    return response.result;
  });
  serial = next;
  return next;
};
let owner;
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  record('timeout', {});
  owner?.session.abort();
  child.kill('SIGTERM');
}, config.timeoutMs);
let result;
try {
  const ready = await lines.next();
  if (ready.done || JSON.parse(ready.value).status !== 'ready') throw new Error('Policy RPC failed to initialize');
  owner = await createPolicySession({ ...config, sessionDir: `${config.output}/sessions` }, call, record);
  await owner.session.prompt(config.prompt);
  if (timedOut) throw new Error('Run exceeded wall-clock limit');
  if (owner.boundary.failure) throw owner.boundary.failure;
  const task = await call('finish', {});
  result = { status: 'terminated', task, gate: owner.gate.snapshot() };
} catch (error) {
  result = { status: 'failed', error: String(error), gate: owner?.gate.snapshot() };
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  owner?.session.dispose();
  child.stdin.end();
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
  const rpcExit = await exited;
  clearTimeout(killTimer);
  writeFileSync(`${config.output}/result.json`, JSON.stringify({ ...result, rpcExit,
    elapsedMs: performance.now() - started, evaluationStatus: 'not_run' }, null, 2));
}
