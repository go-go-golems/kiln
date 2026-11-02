#!/usr/bin/env python3
"""Calibrate Kiln's analytic cost model against measured PassBench GPU times.

For every graph the uniform bands accepted, take the measured compiled GPU median (and eager
GPU median, end-to-end median) from benchmark.log, recompile the exact staged script with
664-predict-program-cost.mjs and compare: Spearman rank correlation of predicted vs measured
compiled GPU time over all graphs, within families, and for the Loop IR work estimate.

usage: 664-calibrate-cost-model.py --output OUT.json [--bands pending-ordinary regression ...]
"""
import argparse, json, re, subprocess, statistics, tempfile
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
STUDY = TICKET / 'sources/uniform-importable-qualification-v1'
PERF = re.compile(r'\[Performance\]\[(eager|compiled)\]: (\{.*\})')


def ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i]); r = [0.0] * len(xs); i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]: j += 1
        for k in range(i, j + 1): r[order[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(a, b):
    if len(a) < 3: return None
    ra, rb = ranks(a), ranks(b); ma, mb = statistics.mean(ra), statistics.mean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den if den else None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--bands', nargs='+', default=['pending-ordinary', 'pending-large', 'regression'])
    a = p.parse_args()
    rows, jobs = [], []
    for band in a.bands:
        audit = json.loads((STUDY / f'{band}-audit.json').read_text())
        for task in audit['records']:
            directory = STUDY / band / f"task-{task['index']:03d}"
            manifest = json.loads((directory / 'corpus/manifest.json').read_text())
            blocks = (directory / 'benchmark.log').read_text().split('graph-net-test-compiler-log [Processing] ')[1:]
            for graph, variant, block in zip(task['graphs'], manifest['variants'], blocks):
                assert block.split('\n', 1)[0].strip().endswith(graph['graph']) and variant['graph'] == graph['graph']
                if not graph['nominal_accepted']: continue
                perf = {k: json.loads(v) for k, v in PERF.findall(block)}
                if set(perf) != {'eager', 'compiled'}: continue
                row = {'id': len(rows), 'band': band, 'task': task['index'], 'graph': graph['graph'], 'dtype': graph['graph'].split('/')[3],
                       'compiled_gpu_ms': perf['compiled']['gpu']['median'], 'eager_gpu_ms': perf['eager']['gpu']['median'],
                       'compiled_e2e_ms': perf['compiled']['e2e']['median']}
                rows.append(row); jobs.append({'id': row['id'], 'script': str(directory / 'corpus' / variant['script'])})
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / 'jobs.json').write_text(json.dumps(jobs))
        subprocess.run(['node', str(Path(__file__).with_name('664-predict-program-cost.mjs')), str(Path(tmp) / 'jobs.json'), str(Path(tmp) / 'out.json')], check=True)
        predictions = {r['id']: r for r in json.loads((Path(tmp) / 'out.json').read_text())}
    for row in rows: row.update({k: v for k, v in predictions[row['id']].items() if k != 'id'})
    ok = [r for r in rows if 'error' not in r]
    measured = [r['compiled_gpu_ms'] * 1000 for r in ok]
    summary = {'graphs': len(rows), 'predicted': len(ok),
               'spearman_a100_model_vs_measured': spearman([r['predicted_us'] for r in ok], measured),
               'spearman_gb10_model_vs_measured': spearman([r['predicted_gb10_us'] for r in ok], measured),
               'spearman_work_vs_measured': spearman([r['work'] for r in ok], measured),
               'median_ratio_measured_over_gb10_model': statistics.median(m / r['predicted_gb10_us'] for m, r in zip(measured, ok) if r['predicted_gb10_us'] > 0),
               'median_e2e_minus_gpu_us': statistics.median((r['compiled_e2e_ms'] - r['compiled_gpu_ms']) * 1000 for r in ok)}
    within = {}
    for r in ok: within.setdefault((r['band'], r['task']), []).append(r)
    per_family = [spearman([r['predicted_gb10_us'] for r in g], [r['compiled_gpu_ms'] for r in g]) for g in within.values() if len(g) >= 5]
    per_family = [x for x in per_family if x is not None]
    summary.update(families_with_5plus=len(per_family), median_within_family_spearman_gb10=statistics.median(per_family) if per_family else None)
    a.output.write_text(json.dumps({'format': 'kiln-cost-model-calibration/1', 'summary': summary, 'rows': rows}, indent=1) + '\n')
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
