// `pnpm --filter @kiln/server lab:import [perf-lab-data-dir]`: copies a Perf Lab data directory into this server's
// database and KILN_DATA_DIR/lab/ (importer.ts). The default source is lab-workbench/.data; a relative path resolves
// against the current directory, which is apps/server under `pnpm --filter`. Exit status: 0 imported (or nothing new),
// 1 something was refused (listed), 2 the source could not be read.
import { resolve } from 'node:path';
import { loadConfig, REPO } from '../config.ts';
import { openDb } from '../db.ts';
import { formatSummary, importPerfLab, refusedCount } from './importer.ts';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length > 1) {
  process.stdout.write(
    'usage: pnpm --filter @kiln/server lab:import [perf-lab-data-dir]\n\n' +
      'Copies Perf Lab\'s artifacts, runs and bundles, jobs (history), programs, annotations, evidence archives,\n' +
      'datasets and media from <perf-lab-data-dir> (default: lab-workbench/.data; its perf-lab.sqlite is opened\n' +
      'read-only) into $KILN_DATA_DIR/kiln.sqlite and $KILN_DATA_DIR/lab/. Every recorded hash is verified; re-running\n' +
      'adds nothing new. Assistant transcripts are not imported.\n',
  );
  process.exit(args.length > 1 ? 2 : 0);
}

const config = loadConfig();
const source = resolve(args[0] ?? resolve(REPO, 'lab-workbench/.data'));
const db = openDb(config.dbFile);
try {
  const summary = importPerfLab({ source, db, dataDir: config.dataDir });
  process.stdout.write(formatSummary(summary, config));
  process.exitCode = refusedCount(summary) ? 1 : 0;
} catch (e) {
  process.stderr.write(`lab:import: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 2;
} finally {
  db.close();
}
