#!/usr/bin/env python3
"""Find complete uniform-qualification families whose executables change under a program.

Compile-only census for choosing the held-out three-arm cost-gate study. Uses the exact staged
scripts of the uniform bands (snapshot 0c17cee) and excludes reference 35's twelve tasks.

usage: 666-select-held-out-gate-population.py PROGRAM.json OUT.json [--bands ...]
"""
import argparse, json, subprocess, tempfile
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
STUDY = TICKET / 'sources/uniform-importable-qualification-v1'
REFERENCE_35 = {7, 25, 74, 83, 89, 101, 106, 107, 127, 149, 159, 165}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('program', type=Path)
    p.add_argument('output', type=Path)
    p.add_argument('--bands', nargs='+', default=['pending-ordinary', 'regression'])
    a = p.parse_args()
    jobs, meta = [], {}
    for band in a.bands:
        for task in json.loads((STUDY / f'{band}-audit.json').read_text())['records']:
            if not task['nominal_accepted'] or task['index'] in REFERENCE_35:
                continue
            directory = STUDY / band / f"task-{task['index']:03d}"
            manifest = json.loads((directory / 'corpus/manifest.json').read_text())
            for variant in manifest['variants']:
                meta[len(jobs)] = {'band': band, 'task': task['index'], 'graph': variant['graph']}
                jobs.append({'id': len(jobs), 'script': str(directory / 'corpus' / variant['script'])})
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / 'jobs.json').write_text(json.dumps(jobs))
        subprocess.run(['node', str(Path(__file__).with_name('666-compare-program-arms.mjs')), str(a.program),
                        str(Path(tmp) / 'jobs.json'), str(Path(tmp) / 'out.json')], check=True)
        rows = [meta[r['id']] | r for r in json.loads((Path(tmp) / 'out.json').read_text())]
    families = {}
    for r in rows:
        f = families.setdefault(r['task'], {'task': r['task'], 'band': r['band'], 'graphs': 0, 'changed': 0, 'errors': 0, 'gate_transformed': 0})
        f['graphs'] += 1; f['changed'] += bool(r.get('changed')); f['errors'] += 'error' in r
        f['gate_transformed'] += r.get('changed', False) and r.get('gate') == 'transformed'
    summary = sorted(families.values(), key=lambda f: f['task'])
    a.output.write_text(json.dumps({'format': 'kiln-held-out-gate-census/1', 'program': str(a.program),
                                    'families': summary, 'rows': rows}, indent=1) + '\n')
    changed = [f for f in summary if f['changed']]
    print(json.dumps({'families': len(summary), 'graphs': len(rows), 'changed_families': len(changed),
                      'changed_graphs': sum(f['changed'] for f in changed),
                      'gate_differs_from_always': sum(f['changed'] - f['gate_transformed'] for f in changed),
                      'errors': sum(f['errors'] for f in summary)}, indent=1))
    for f in changed: print(f)


if __name__ == '__main__':
    main()
