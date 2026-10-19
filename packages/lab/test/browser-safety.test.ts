// The browser entry (src/index.ts) must bundle for the browser (Phase 8b imports it): everything it reaches is a
// relative `.ts` module of this package or @kiln/evidence's, never a Node built-in, never src/node/, never another
// package. Statically: follow every import and export-from in the module graph.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');
const EVIDENCE = resolve(here, '../../evidence/src/index.ts');

const SPECIFIER = /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function graph(entry: string) {
  const seen = new Set<string>();
  const bad: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[1] ?? m[2] ?? m[3]!;
      if (spec === '@kiln/evidence') visit(EVIDENCE);
      else if (spec.startsWith('./') || spec.startsWith('../')) {
        if (!spec.endsWith('.ts')) bad.push(`${file}: ${spec} (no .ts extension)`);
        visit(resolve(dirname(file), spec));
      } else bad.push(`${file}: ${spec}`);
    }
  };
  visit(entry);
  return { files: [...seen], bad };
}

describe('the browser entry', () => {
  const { files, bad } = graph(resolve(SRC, 'index.ts'));

  it('imports nothing but its own modules and @kiln/evidence', () => {
    expect(bad).toEqual([]);
    expect(files.length).toBeGreaterThan(20);
  });

  it('never reaches the Node-only modules', () => {
    expect(files.filter((f) => f.startsWith(resolve(SRC, 'node')))).toEqual([]);
  });

  it('uses no Node globals', () => {
    // `require('…')` with a string argument (CompareB has a method named `require`)
    const NODE = /\b(process\.(env|argv|cwd)|Buffer\.|__dirname|__filename)|(?<![\w.$])require\(\s*['"]/;
    expect(files.filter((f) => NODE.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
