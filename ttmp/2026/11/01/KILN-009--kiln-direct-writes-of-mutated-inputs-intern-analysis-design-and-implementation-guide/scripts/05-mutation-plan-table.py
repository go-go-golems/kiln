#!/usr/bin/env python3
"""Phase 1 table (KILN-009): export and compile the input-mutation families with this worktree's Kiln (the settings
of KILN-005 script 674: a100 spec, contraction separate, FP32 products, internal reference check ON) and tabulate,
per graph, the strategy exportProgram chose for every mutation (program.mutations[]), its reason, and the launch
count. Run from any directory; --upstream is a PassBench checkout (KILN-005 sources/upstream).

usage: 05-mutation-plan-table.py --upstream DIR --work DIR --output table.json INDEX...
"""
import argparse, collections, json, subprocess, sys
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
ROOT = TICKET.parents[4]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--upstream', required=True, type=Path)
p.add_argument('--work', required=True, type=Path)
p.add_argument('--output', required=True, type=Path)
p.add_argument('--reuse', action='store_true', help='skip export and compile when the task directory exists')
p.add_argument('indices', nargs='+', type=int)
a = p.parse_args()
samples = (a.upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
corpus = ROOT / 'integrations/passnet/corpus.py'
tasks = []
for index in a.indices:
    d = a.work / f'task-{index:03d}'
    if not (a.reuse and (d / 'manifest.json').exists()):
        e = subprocess.run([sys.executable, str(corpus), 'export', '--upstream', str(a.upstream), '--sample', samples[index], '--output', str(d)], capture_output=True, text=True, cwd=ROOT)
        if e.returncode:
            tasks.append({'index': index, 'export_error': e.stderr.strip().splitlines()[-1:]}); print(index, 'EXPORT FAILED', e.stderr[-300:], flush=True); continue
        subprocess.run([sys.executable, str(corpus), 'compile', '--directory', str(d), '--kiln', str(ROOT), '--target', 'a100',
                        '--contraction', 'separate', '--matmul-precision', 'highest'], capture_output=True, text=True, cwd=ROOT)
    manifest = json.loads((d / 'manifest.json').read_text())
    graphs = []
    for v in manifest['variants']:
        art = (d / v['script']).with_suffix('.json')
        row = {'script': v['script'], 'mutations_declared': len(v['input_mutations'])}
        if not art.exists():
            log = (d / v['script']).with_suffix('.compile.log')
            row['compile_error'] = [l for l in (log.read_text().splitlines() if log.exists() else []) if 'rror' in l or 'FAIL' in l or 'failed' in l][:2]
        else:
            prog = json.loads(art.read_text())
            row['kernels'] = len(prog['kernels'])
            row['mutations'] = [{k: m.get(k) for k in ('output', 'input', 'strategy', 'reason')} for m in prog.get('mutations', [])]
        graphs.append(row)
    strategies = collections.Counter(m['strategy'] for g in graphs for m in g.get('mutations', []))
    reasons = collections.Counter(m['reason'].split(': ', 1)[-1] if m['reason'] else None for g in graphs for m in g.get('mutations', []) if m['strategy'] != 'direct')
    tasks.append({'index': index, 'graphs': len(graphs), 'compiled': sum('kernels' in g for g in graphs),
                  'strategies': dict(strategies), 'writeback_reasons': dict(reasons), 'per_graph': graphs})
    print(index, f"{tasks[-1]['compiled']}/{len(graphs)}", dict(strategies), dict(reasons), flush=True)
total = collections.Counter()
for t in tasks: total.update(t.get('strategies', {}))
a.output.write_text(json.dumps({'format': 'kiln-mutation-plan-table/1', 'kiln_root': str(ROOT), 'totals': dict(total), 'tasks': tasks}, indent=2) + '\n')
print('totals', dict(total))
