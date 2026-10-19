// The CUDA runner executor (guide §30.5): runs runner/kiln_runner.py on this machine or, through SSH, on a GPU host.
// One runner invocation is one protocol repetition: the bundle goes in on stdin, kiln-results/1 comes out on stdout,
// progress lines come out on stderr.
//
// Cancellation. The child runs in its own process group, and an abort signals the whole group (runner, nvcc, the
// compiled harness). The bundle is written with stdin left open and the runner is started with --exit-on-eof, so
// when the connection goes away (the SSH client killed, or this server gone) the runner sees end of file and stops
// its own process group: that is what ties a remote run's lifetime to the SSH connection.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { sha256Hex } from '@kiln/evidence';
import type { DeviceReport, Executor, KilnBundle, KilnResults } from './types.ts';

export interface CudaRunnerOptions {
  id: string;
  target: 'local' | 'ssh';
  /** SSH destination, e.g. "playback@playback-rtx-dev" (target 'ssh' only) */
  host?: string;
  /** Interpreter on the machine that runs the runner (default python3) */
  python?: string;
  /** Local path of kiln_runner.py; the SSH executor copies it to the host */
  runner: string;
  /** Directory on the SSH host the runner is copied to (default ~/.cache/kiln-runner) */
  runnerDir?: string;
  /** Extra environment for the runner, e.g. { KILN_ARCH: "native" } */
  env?: Record<string, string>;
  /** Refuse a runner that prints more than this on stdout (default 64 MiB) */
  maxOutputBytes?: number;
  /** After SIGTERM, wait this long before SIGKILL (default 2 s) */
  killGraceMs?: number;
}

export interface Command {
  cmd: string;
  args: string[];
}

/** Single-quote a word for a POSIX shell. */
export const shq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** user@host, host, host:port is not accepted (use ~/.ssh/config); no leading '-' (option injection) */
const SSH_DEST = /^[A-Za-z0-9_.][A-Za-z0-9_.@-]*$/;

export class CudaRunnerExecutor implements Executor {
  readonly id: string;
  readonly target: 'local' | 'ssh';
  readonly host: string;
  private readonly python: string;
  private readonly runner: string;
  private readonly runnerDir: string;
  private readonly env: Record<string, string>;
  private readonly maxOutputBytes: number;
  private readonly killGraceMs: number;
  private installed: Promise<void> | null = null;
  private runnerText: string | null = null;

  constructor(o: CudaRunnerOptions) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(o.id)) throw new TypeError(`executor id must be lowercase letters, digits and hyphens (got ${o.id})`);
    if (o.target !== 'local' && o.target !== 'ssh') throw new TypeError(`executor ${o.id}: target must be "local" or "ssh"`);
    if (o.target === 'ssh' && !(o.host && SSH_DEST.test(o.host))) throw new TypeError(`executor ${o.id}: host must be an SSH destination like user@host (got ${o.host})`);
    for (const k of Object.keys(o.env ?? {})) if (!ENV_NAME.test(k)) throw new TypeError(`executor ${o.id}: bad environment variable name ${k}`);
    this.id = o.id;
    this.target = o.target;
    this.host = o.target === 'ssh' ? (o.host as string) : hostname();
    this.python = o.python ?? 'python3';
    this.runner = o.runner;
    this.runnerDir = o.runnerDir ?? '~/.cache/kiln-runner';
    this.env = { ...(o.env ?? {}) };
    this.maxOutputBytes = o.maxOutputBytes ?? 64 * 1024 * 1024;
    this.killGraceMs = o.killGraceMs ?? 2000;
  }

  private text(): string {
    return (this.runnerText ??= readFileSync(this.runner, 'utf8'));
  }

  /** Where the runner lives on the SSH host: content-addressed, so a changed runner is a new file. */
  remoteRunnerPath(): string {
    return `${remoteDir(this.runnerDir)}/${shq(`kiln_runner-${sha256Hex(this.text()).slice(0, 16)}.py`)}`;
  }

  /** The command that runs the runner with `sub` (e.g. ['device'] or ['run', '-', '--out', '-']). */
  commandFor(sub: string[]): Command {
    if (this.target === 'local') return { cmd: this.python, args: [this.runner, ...sub] };
    const env = Object.entries(this.env);
    const words = [...(env.length ? ['env', ...env.map(([k, v]) => `${k}=${shq(v)}`)] : []), shq(this.python), this.remoteRunnerPath(), ...sub.map(shq)];
    return { cmd: 'ssh', args: ['-T', '-o', 'BatchMode=yes', '--', this.host, words.join(' ')] };
  }

  /** The SSH command that copies the runner (on stdin) to the host unless it is already there. */
  installCommand(): Command {
    const dir = remoteDir(this.runnerDir), path = this.remoteRunnerPath();
    const script = `mkdir -p ${dir} && if [ -f ${path} ]; then cat >/dev/null; else cat > ${path}.tmp.$$ && mv ${path}.tmp.$$ ${path}; fi`;
    return { cmd: 'ssh', args: ['-T', '-o', 'BatchMode=yes', '--', this.host, script] };
  }

  private install(signal?: AbortSignal): Promise<void> {
    if (this.target === 'local') return Promise.resolve();
    this.installed ??= this.exec(this.installCommand(), { input: this.text(), signal }).then(
      () => undefined,
      (e) => {
        this.installed = null;
        throw e;
      },
    );
    return this.installed;
  }

  async probe(signal?: AbortSignal): Promise<DeviceReport> {
    await this.install(signal);
    const out = await this.exec(this.commandFor(['device']), { signal });
    const report = parseJson(out, 'the device report') as DeviceReport;
    if (typeof report !== 'object' || report === null || Array.isArray(report)) throw new Error('the device report is not a JSON object');
    if (report.error) throw new Error(String(report.error));
    return report;
  }

  async runRepetition(bundle: KilnBundle, signal: AbortSignal, onLine?: (line: string) => void): Promise<KilnResults> {
    await this.install(signal);
    const out = await this.exec(this.commandFor(['run', '-', '--out', '-', '--exit-on-eof']), { input: JSON.stringify(bundle), keepStdinOpen: true, signal, onLine });
    const res = parseJson(out, 'the results') as KilnResults;
    if (res?.format !== 'kiln-results/1' || !Array.isArray(res.kernels)) throw new Error('the runner did not print kiln-results/1');
    return res;
  }

  /** Spawn, feed stdin, collect stdout, stream stderr lines; kill the process group on abort. */
  private exec(c: Command, o: { input?: string; keepStdinOpen?: boolean; signal?: AbortSignal | undefined; onLine?: ((line: string) => void) | undefined }): Promise<string> {
    const { signal } = o;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const env = this.target === 'local' ? { ...process.env, ...this.env } : process.env;
      const child = spawn(c.cmd, c.args, { env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
      const out: Buffer[] = [];
      let bytes = 0, partial = '', settled = false, failure: Error | null = null;
      const tail: string[] = [];
      const killGroup = (sig: NodeJS.Signals) => {
        try {
          if (child.pid) process.kill(-child.pid, sig);
        } catch {
          /* already gone */
        }
      };
      const stop = (why: Error) => {
        failure ??= why;
        child.stdin.destroy();
        killGroup('SIGTERM');
        setTimeout(() => killGroup('SIGKILL'), this.killGraceMs).unref();
      };
      const onAbort = () => stop(signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason ?? 'aborted')));
      signal?.addEventListener('abort', onAbort, { once: true });
      const finish = (e: Error | null, value?: string) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        child.stdin.destroy();
        if (e) reject(e);
        else resolve(value ?? '');
      };
      const line = (l: string) => {
        tail.push(l);
        if (tail.length > 20) tail.shift();
        o.onLine?.(l);
      };
      child.stdout.on('data', (b: Buffer) => {
        bytes += b.length;
        if (bytes > this.maxOutputBytes) return stop(new Error(`the runner printed more than ${this.maxOutputBytes} bytes`));
        out.push(b);
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (s: string) => {
        const parts = (partial + s).split('\n');
        partial = parts.pop() ?? '';
        for (const l of parts) if (l.trim()) line(l);
      });
      child.stdin.on('error', () => {
        /* the runner exited before reading everything; its exit status says why */
      });
      child.on('error', (e) => finish(e));
      child.on('close', (code, sig) => {
        if (partial.trim()) line(partial);
        if (failure) return finish(failure);
        if (code === 0) return finish(null, Buffer.concat(out).toString('utf8'));
        finish(new Error(`${c.cmd} exited with ${code ?? sig}${tail.length ? `: ${tail.slice(-5).join(' | ')}` : ''}`));
      });
      if (o.input !== undefined) child.stdin.write(o.input + '\n');
      if (!o.keepStdinOpen) child.stdin.end();
    });
  }
}

function remoteDir(dir: string): string {
  if (dir === '~') return '"$HOME"';
  if (dir.startsWith('~/')) return `"$HOME"/${shq(dir.slice(2))}`;
  return shq(dir);
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what}: not JSON (${text.slice(0, 120).trim() || 'empty output'})`);
  }
}
