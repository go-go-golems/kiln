#!/usr/bin/env python3
"""Local compile gate before freezing a GPU replay: export and compile every graph of the given
tasks with the replay's qualification settings (a100 spec, contraction separate, tf32, mutations
written by the program, internal reference check ON), and report per task.

usage: 674-local-compile-gate.py --output DIR INDEX...
"""
import argparse, json, subprocess, sys
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
ROOT = TICKET.parents[4]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', required=True, type=Path)
p.add_argument('indices', nargs='+', type=int)
a = p.parse_args()
upstream = TICKET / 'sources/upstream'
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
corpus = ROOT / 'integrations/passnet/corpus.py'
report = []
for index in a.indices:
    d = a.output / f'task-{index:03d}'
    e = subprocess.run([sys.executable, str(corpus), 'export', '--upstream', str(upstream), '--sample', samples[index], '--output', str(d)], capture_output=True, text=True, cwd=ROOT)
    if e.returncode:
        report.append({'index': index, 'export': e.stderr.strip().splitlines()[-1:]}); print(index, 'EXPORT FAILED', e.stderr[-300:], flush=True); continue
    subprocess.run([sys.executable, str(corpus), 'compile', '--directory', str(d), '--kiln', str(ROOT), '--target', 'a100',
                    '--contraction', 'separate', '--matmul-precision', 'tf32'], capture_output=True, text=True, cwd=ROOT)
    manifest = json.loads((d / 'manifest.json').read_text())
    graphs = [(v['script'], (d / v['script']).with_suffix('.json').exists()) for v in manifest['variants']]
    failures = {}
    for script, ok in graphs:
        if not ok:
            log = (d / script).with_suffix('.compile.log')
            lines = [l for l in (log.read_text().splitlines() if log.exists() else []) if 'Error' in l or 'failed' in l or 'FAILED' in l]
            failures[script] = lines[:2]
    report.append({'index': index, 'graphs': len(graphs), 'compiled': sum(ok for _, ok in graphs), 'failures': failures})
    print(index, f"{sum(ok for _, ok in graphs)}/{len(graphs)}", next(iter(failures.values()), ''), flush=True)
(a.output / 'gate.json').write_text(json.dumps({'format': 'kiln-local-compile-gate/1', 'tasks': report}, indent=2) + '\n')
