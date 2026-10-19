/**
 * Command line for the lab server's evidence archives and datasets.
 *
 *   pnpm lab evidence add <file.tar.gz> [--name <name>]   register an archive (and the datasets it contains)
 *   pnpm lab evidence list
 *   pnpm lab datasets list
 *   pnpm lab datasets materialize <id-or-prefix>          fetch and verify the dataset's public images
 *   pnpm lab models fetch                                 download the pinned Grounding DINO snapshot (≈ 690 MB)
 *
 * The server must be running (pnpm lab-server); PERF_LAB_URL overrides http://127.0.0.1:5198.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = `${process.env.PERF_LAB_URL ?? 'http://127.0.0.1:5198'}/api`;
const [, , group, cmd, ...rest] = process.argv;

const fail = (msg: string): never => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};

async function call<T>(method: string, path: string, body?: Uint8Array): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, body: body as BodyInit | undefined, headers: body ? { 'content-type': 'application/gzip' } : {} }).catch((e: Error) =>
    fail(`cannot reach ${BASE}: ${e.message} (is pnpm lab-server running?)`),
  );
  const json = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) fail(`${method} ${path}: ${res.status} ${json.message ?? json.error ?? ''}`);
  return json;
}

const opt = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

interface Archive {
  sha256: string;
  name: string;
  bytes: number;
  files: { path: string }[];
  datasets: string[];
}
interface Dataset {
  id: string;
  name: string;
  imageCount: number;
  annotationCount: number;
  present: number;
}

async function waitForMaterialized(id: string) {
  const res = await fetch(`${BASE}/events`);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null') as Record<string, unknown> | null;
      if (event === 'dataset.progress' && data?.id === id) process.stdout.write(`\r${data.present}/${data.total} images present`);
      if (event === 'dataset.materialized' && data?.datasetId === id) {
        const failed = data.failed as { imageId: number; reason: string }[];
        process.stdout.write(`\n${data.fetched} fetched and verified · ${data.present}/${data.total} present · ${failed.length} failed\n`);
        for (const f of failed) process.stdout.write(`  image ${f.imageId}: ${f.reason}\n`);
        await reader.cancel();
        return;
      }
    }
  }
}

async function main() {
  if (group === 'evidence' && cmd === 'add') {
    const file = rest[0] ?? fail('usage: pnpm lab evidence add <file.tar.gz> [--name <name>]');
    const name = opt('name') ?? basename(file).replace(/\.tar\.gz$|\.tgz$/, '');
    const a = await call<Archive>('POST', `/evidence?name=${encodeURIComponent(name)}`, readFileSync(file));
    process.stdout.write(`${a.sha256}  ${a.name}  ${a.files.length} files, ${a.bytes} bytes\n`);
    for (const d of a.datasets) process.stdout.write(`dataset ${d} registered; fetch its images with: pnpm lab datasets materialize ${d.slice(0, 12)}\n`);
  } else if (group === 'evidence' && cmd === 'list') {
    for (const a of await call<Archive[]>('GET', '/evidence')) process.stdout.write(`${a.sha256}  ${a.name}  ${a.files.length} files  datasets: ${a.datasets.join(', ') || 'none'}\n`);
  } else if (group === 'datasets' && cmd === 'list') {
    for (const d of await call<Dataset[]>('GET', '/datasets')) process.stdout.write(`${d.id}  ${d.name}  ${d.imageCount} images (${d.present} present), ${d.annotationCount} annotations\n`);
  } else if (group === 'datasets' && cmd === 'materialize') {
    const prefix = rest[0] ?? fail('usage: pnpm lab datasets materialize <id-or-prefix>');
    const matches = (await call<Dataset[]>('GET', '/datasets')).filter((d) => d.id.startsWith(prefix));
    if (matches.length !== 1) fail(`${matches.length} datasets match ${prefix}`);
    const d = matches[0];
    const waiting = waitForMaterialized(d.id);
    const r = await call<{ missing: number }>('POST', `/datasets/${d.id}/materialize`);
    process.stdout.write(`${d.name}: fetching ${r.missing} missing images from their public source, verifying each SHA-256\n`);
    await waiting;
  } else if (group === 'models' && cmd === 'fetch') {
    // the snapshot the DGX evidence used (artifact-provenance.json: model_snapshot), not whatever main is today
    const workloads = resolve(fileURLToPath(new URL('../workloads', import.meta.url)));
    const code = [
      'from huggingface_hub import snapshot_download',
      "p = snapshot_download('IDEA-Research/grounding-dino-tiny', revision='a2bb814dd30d776dcf7e30523b00659f4f141c71')",
      'print(p)',
    ].join('; ');
    const r = spawnSync(process.env.PERF_LAB_UV ?? 'uv', ['run', '--project', workloads, 'python', '-c', code], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  } else {
    fail('usage: pnpm lab evidence add <file> [--name n] | evidence list | datasets list | datasets materialize <id> | models fetch');
  }
}

void main();
