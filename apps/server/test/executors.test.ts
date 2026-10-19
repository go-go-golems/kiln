import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '@kiln/evidence';
import { describe, expect, it } from 'vitest';
import { REPO } from '../src/config.ts';
import { CudaRunnerExecutor, shq } from '../src/executors/cuda-runner.ts';
import { loadExecutors } from '../src/executors/index.ts';
import { FAKE_RUNNER, fakeExecutor, tempDir } from './support/server.ts';

const RUNNER = join(REPO, 'runner/kiln_runner.py');

describe('the SSH executor (commands only: these tests never run ssh)', () => {
  const ex = new CudaRunnerExecutor({ id: 'rtx-dev', target: 'ssh', host: 'playback@playback-rtx-dev', runner: RUNNER, env: { KILN_ARCH: 'native', ODD: "it's" } });
  const file = `kiln_runner-${sha256Hex(readFileSync(RUNNER, 'utf8')).slice(0, 16)}.py`;

  it('runs the content-addressed runner copy through ssh -T in batch mode', () => {
    expect(ex.host).toBe('playback@playback-rtx-dev');
    expect(ex.remoteRunnerPath()).toBe(`"$HOME"/'.cache/kiln-runner'/'${file}'`);
    expect(ex.commandFor(['run', '-', '--out', '-', '--exit-on-eof'])).toEqual({
      cmd: 'ssh',
      args: ['-T', '-o', 'BatchMode=yes', '--', 'playback@playback-rtx-dev', `env KILN_ARCH='native' ODD='it'\\''s' 'python3' "$HOME"/'.cache/kiln-runner'/'${file}' 'run' '-' '--out' '-' '--exit-on-eof'`],
    });
  });

  it('copies the runner once, atomically, only when it is missing', () => {
    const { cmd, args } = ex.installCommand();
    const p = `"$HOME"/'.cache/kiln-runner'/'${file}'`;
    expect([cmd, ...args.slice(0, 5)]).toEqual(['ssh', '-T', '-o', 'BatchMode=yes', '--', 'playback@playback-rtx-dev']);
    expect(args[5]).toBe(`mkdir -p "$HOME"/'.cache/kiln-runner' && if [ -f ${p} ]; then cat >/dev/null; else cat > ${p}.tmp.$$ && mv ${p}.tmp.$$ ${p}; fi`);
  });

  it('refuses destinations that would be ssh options, and bad environment names', () => {
    for (const host of ['-oProxyCommand=touch /tmp/x', 'a b', 'host;rm', '', 'host:22']) expect(() => new CudaRunnerExecutor({ id: 'x', target: 'ssh', host, runner: RUNNER })).toThrow(/SSH destination/);
    expect(() => new CudaRunnerExecutor({ id: 'x', target: 'local', runner: RUNNER, env: { 'A;B': '1' } })).toThrow(/environment variable name/);
    expect(() => new CudaRunnerExecutor({ id: 'Bad Id', target: 'local', runner: RUNNER })).toThrow(/executor id/);
  });

  it('quotes for a POSIX shell', () => {
    expect(shq(`a'b c$d`)).toBe(`'a'\\''b c$d'`);
  });
});

describe('the local executor (with the fake runner)', () => {
  it('runs the runner with python, the runner path and the subcommand', () => {
    expect(new CudaRunnerExecutor({ id: 'local-cuda', target: 'local', runner: RUNNER }).commandFor(['device'])).toEqual({ cmd: 'python3', args: [RUNNER, 'device'] });
  });

  it('probes, and passes its environment to the runner', async () => {
    const report = await fakeExecutor({ KILN_FAKE_DEVICE: JSON.stringify({ name: 'Env GPU', cc: '8.9' }) }).probe();
    expect(report).toEqual({ name: 'Env GPU', cc: '8.9' });
    await expect(fakeExecutor({ KILN_FAKE_DEVICE: JSON.stringify({ error: 'no CUDA device' }) }).probe()).rejects.toThrow('no CUDA device');
    await expect(new CudaRunnerExecutor({ id: 'gone', target: 'local', python: '/nonexistent/python3', runner: FAKE_RUNNER }).probe()).rejects.toThrow(/ENOENT/);
  });

  it('kills the runner\'s process group when the signal aborts', async () => {
    const ex = fakeExecutor({ KILN_FAKE_DELAY_MS: '30000' });
    const ac = new AbortController();
    const t0 = Date.now();
    const run = ex.runRepetition({ format: 'kiln-bundle/1', reps: 1, warmup: 0, ncu: false, kernels: [] }, ac.signal);
    setTimeout(() => ac.abort(new Error('stop')), 200);
    await expect(run).rejects.toThrow('stop');
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('executor profiles (KILN_EXECUTORS)', () => {
  const write = (json: unknown) => {
    const f = join(tempDir(), 'executors.json');
    writeFileSync(f, typeof json === 'string' ? json : JSON.stringify(json));
    return f;
  };

  it('no file: no executors', () => {
    expect(loadExecutors({ executorsFile: join(tempDir(), 'none.json'), runner: RUNNER })).toEqual({ executors: [], errors: [] });
  });

  it('builds CUDA runner executors and reports the profiles it refuses', () => {
    const { executors, errors } = loadExecutors({
      runner: RUNNER,
      executorsFile: write({
        executors: [
          { id: 'rtx-dev', target: 'ssh', host: 'playback@playback-rtx-dev', python: 'python3', runnerDir: '~/.cache/kiln-runner', env: { KILN_ARCH: 'native' } },
          { id: 'local-cuda', target: 'local' },
          { id: 'fake', target: 'fake' },
          { id: 'rtx-dev', target: 'local' },
          { id: 'ssh-no-host', target: 'ssh' },
          { id: 'bad-env', target: 'local', env: { A: 1 } },
        ],
      }),
    });
    expect(executors.map((e) => [e.id, e.target])).toEqual([['rtx-dev', 'ssh'], ['local-cuda', 'local']]);
    expect(executors.every((e) => e instanceof CudaRunnerExecutor)).toBe(true);
    expect(errors).toEqual([
      'executor fake: target must be "local" or "ssh"',
      'executor rtx-dev is defined twice',
      'executor ssh-no-host: host must be an SSH destination like user@host (got undefined)',
      'executor bad-env: env must map names to strings',
    ]);
  });

  it('reports a file that is not JSON or not the right shape', () => {
    expect(loadExecutors({ runner: RUNNER, executorsFile: write('{') }).errors[0]).toMatch(/executors\.json: /);
    expect(loadExecutors({ runner: RUNNER, executorsFile: write({ hosts: [] }) }).errors[0]).toMatch(/expected \{ "executors": \[\.\.\.\] \}/);
  });
});
