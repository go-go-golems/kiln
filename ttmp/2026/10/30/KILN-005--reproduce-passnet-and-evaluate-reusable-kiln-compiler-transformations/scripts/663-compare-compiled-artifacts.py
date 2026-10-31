#!/usr/bin/env python3
"""Compile a deterministic sample of traced corpus scripts with two Kiln trees and compare kernels.

Scripts come from a 662 output directory (with N.expect bindings). Modes compared per script:
  base  : OLD tree, expect bindings stripped (the previous importer's script)
  new   : NEW tree, expect bindings stripped
  expect: NEW tree, script as generated
Kernel identity, CUDA text, launch geometry and buffer table must agree across all three unless a
difference is listed as intended.

usage: 663-compare-compiled-artifacts.py --scripts DIR --old KILN_TREE --new KILN_TREE --output OUT [--sample N]
"""
import argparse, json, random, re, subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

EXPECT = re.compile(r'^(const \S+ = )N\.expect\((.*), \[[0-9, ]*\], "(?:f32|f16|bf16)"\);$', re.M)


def compile_one(tree, script, out):
    r = subprocess.run(['node', str(Path(tree) / 'scripts/kiln-export.mjs'), '--script', str(script), '--target', 'a100',
                        '--contraction', 'separate', '--no-check', '--out', str(out)], capture_output=True, text=True)
    if r.returncode:
        return {'error': (r.stderr.strip().splitlines() or ['?'])[-1][:300]}
    p = json.loads(out.read_text())
    return {'buffers': p['buffers'], 'inputs': p['inputs'], 'outputs': p['outputs'],
            'kernels': [{k: kn[k] for k in ('name', 'identity', 'row', 'reads', 'writes', 'grid', 'block', 'cuda')} for kn in p['kernels']]}


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--scripts', type=Path, required=True); a.add_argument('--old', required=True); a.add_argument('--new', required=True)
    a.add_argument('--output', type=Path, required=True); a.add_argument('--sample', type=int, default=200)
    args = a.parse_args()
    index = json.loads((args.scripts / 'index.json').read_text())
    graphs = sorted(index); random.Random(663).shuffle(graphs); graphs = sorted(graphs[:args.sample])
    work = args.output.with_suffix('.work'); work.mkdir(parents=True, exist_ok=False)
    def run(item):
        i, graph = item
        text = (args.scripts / index[graph]).read_text()
        stripped = work / f'{i:04d}.core.kiln.js'; stripped.write_text(EXPECT.sub(r'\1\2;', text))
        full = work / f'{i:04d}.expect.kiln.js'; full.write_text(text)
        res = {m: compile_one(t, s, work / f'{i:04d}.{m}.json') for m, t, s in
               (('base', args.old, stripped), ('new', args.new, stripped), ('expect', args.new, full))}
        return graph, {'same_new': res['base'] == res['new'], 'same_expect': res['new'] == res['expect'],
                       'errors': {m: r['error'] for m, r in res.items() if 'error' in r}}
    with ThreadPoolExecutor(8) as pool:
        records = dict(pool.map(run, enumerate(graphs)))
    summary = {'format': 'kiln-artifact-comparison/1', 'sample': len(records),
               'same_new': sum(r['same_new'] for r in records.values()),
               'same_expect': sum(r['same_expect'] for r in records.values()), 'records': records}
    args.output.write_text(json.dumps(summary, indent=1) + '\n')
    print({k: v for k, v in summary.items() if k != 'records'})
    for g, r in records.items():
        if not (r['same_new'] and r['same_expect']): print(g, r)


if __name__ == '__main__':
    main()
