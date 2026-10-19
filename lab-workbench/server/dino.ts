import { spawn, type ChildProcess } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ServerConfig } from './config';
import { getDataset, type DatasetDetail } from './datasets';
import type { Db } from './db';
import { get } from './db';
import type { Bundle } from './importer';
import { importQualification } from './qualification';

/**
 * The local dino workload (workloads/perf_lab_dino): both arms of an experiment run in one Python process per
 * repetition, as PR 1005's benchmark runs them, and both arms are imported from its one report.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DinoCapture {
  hash: string;
  ref: string;
  host: string;
  spec: Json;
}

export interface DinoContext {
  log: (kind: string, detail: string) => void;
  onChild: (child: ChildProcess | null) => void;
}

let repoRoot: string | null = null;
/** A Playback checkout with the arms' revisions: this workbench's own repository (or PERF_LAB_PLAYBACK_REPO). */
export function playbackRepo(config: ServerConfig): string {
  if (process.env.PERF_LAB_PLAYBACK_REPO) return process.env.PERF_LAB_PLAYBACK_REPO;
  repoRoot ??= execFileSync('git', ['-C', config.root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  return repoRoot;
}

/** The dataset images a workload names, with the local path of each verified media file. */
export function workloadImages(db: Db, dataDir: string, spec: Json): { dataset: DatasetDetail; images: Json[] } {
  const id = String(spec.workload?.dataset_sha256 ?? '');
  const dataset = getDataset(db, id);
  if (!dataset) throw new Error(`dataset ${id.slice(0, 12)}… is not registered on this server`);
  const ids = new Set<number>((spec.workload?.image_ids ?? []) as number[]);
  if (!ids.size) throw new Error('the workload names no images');
  const images = dataset.images.filter((i) => ids.has(i.imageId));
  const missing = images.filter((i) => !i.present);
  if (missing.length) throw new Error(`${missing.length} of ${images.length} images are not fetched; run: pnpm lab datasets materialize ${id.slice(0, 12)}`);
  return {
    dataset,
    images: images.map((i) => {
      const mime = get<{ mime: string }>(db, 'select mime from media where sha256 = ?', i.sha256)?.mime;
      return { imageId: i.imageId, fileName: i.fileName, sha256: i.sha256, path: join(dataDir, 'media', `${i.sha256}.${mime === 'image/png' ? 'png' : 'jpg'}`) };
    }),
  };
}

/** Runs one repetition of a baseline/candidate pair and imports both arms. */
export async function runDinoRepetition(
  config: ServerConfig,
  db: Db,
  pair: { baseline: DinoCapture; candidate: DinoCapture },
  mode: 'timing' | 'predictions',
  rep: number,
  ctx: DinoContext,
): Promise<{ baseline: Bundle; candidate: Bundle }> {
  const { dataset, images } = workloadImages(db, config.dataDir, pair.candidate.spec);
  const dir = join(config.artifactsDir, `${pair.baseline.hash.slice(0, 16)}-${pair.candidate.hash.slice(0, 16)}`, `rep-${rep}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const specFile = (c: DinoCapture, name: string) => {
    const f = join(dir, `${name}.spec.json`);
    writeFileSync(f, JSON.stringify(c.spec));
    return f;
  };
  writeFileSync(join(dir, 'images.json'), JSON.stringify(images));
  const args = [
    'run', '--project', config.workloadsDir, 'python', '-m', 'perf_lab_dino.run',
    '--specs', specFile(pair.baseline, 'baseline'), specFile(pair.candidate, 'candidate'),
    '--mode', mode, '--rep', String(rep), '--images', join(dir, 'images.json'), '--repo', playbackRepo(config), '--out', dir,
  ];
  const { exitCode, stderrTail } = await new Promise<{ exitCode: number | null; stderrTail: string }>((resolve) => {
    const child = spawn(config.uv, args, { cwd: config.workloadsDir, env: { ...process.env, PYTHONUNBUFFERED: '1', TQDM_DISABLE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    ctx.onChild(child);
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (!line.startsWith('{')) return;
      try {
        const { event, ...rest } = JSON.parse(line) as { event: string };
        ctx.log(`script.${event}`, `${pair.candidate.ref.replace('/candidate/', '/*/')}#${rep} ${JSON.stringify(rest)}`);
      } catch {
        /* a partial line is not an event */
      }
    });
    child.on('close', (code) => {
      ctx.onChild(null);
      writeFileSync(join(dir, 'stderr.log'), stderr);
      resolve({ exitCode: code, stderrTail: stderr });
    });
    child.on('error', (e) => {
      ctx.onChild(null);
      resolve({ exitCode: -1, stderrTail: `${stderr}\n${e.message}` });
    });
  });
  if (exitCode !== 0) throw new Error(`dino workload exited with ${exitCode}: ${stderrTail.split('\n').filter((l) => l && !/Warning|warn\(|autocast/.test(l)).slice(-3).join(' | ')}`);
  const read = (p: string) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p)) : undefined);
  const files = [mode === 'timing' ? 'paired.json' : 'example-predictions.json'];
  const imp = (c: DinoCapture) => importQualification({ read, source: 'local', reportsDir: 'reports/', spec: c.spec, hash: c.hash, ref: c.ref, host: c.host, dataset, rep0: rep, files })[0];
  return { baseline: imp(pair.baseline), candidate: imp(pair.candidate) };
}
