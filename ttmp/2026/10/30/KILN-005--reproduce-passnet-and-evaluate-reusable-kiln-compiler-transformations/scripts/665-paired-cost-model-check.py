#!/usr/bin/env python3
"""Does the cost model predict the measured effect of a compiler change on the same graph?

Uses the fixed transformation-program study (reference 35): baseline and candidate arms ran
the same 92 graphs. For every graph whose compiled kernels changed, compare the measured
candidate/baseline compiled-GPU-time ratio with the model's predicted ratio (a100 model that
chose the schedules, and the gb10 spec): sign agreement and Spearman rank correlation.

usage: 665-paired-cost-model-check.py --output OUT.json
"""
import argparse, importlib.util, json, re, subprocess, tempfile
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
STUDY = TICKET / 'sources/fixed-policy-passbench-v1'
PERF = re.compile(r'\[Performance\]\[compiled\]: (\{.*\})')
spec = importlib.util.spec_from_file_location('calib', Path(__file__).with_name('664-calibrate-cost-model.py'))
calib = importlib.util.module_from_spec(spec); spec.loader.exec_module(calib)


def arm(name):
    rows = {}
    for directory in sorted((STUDY / name).glob('task-*')):
        manifest = json.loads((directory / 'corpus/manifest.json').read_text())
        blocks = (directory / 'benchmark.log').read_text().split('graph-net-test-compiler-log [Processing] ')[1:]
        for variant, block in zip(manifest['variants'], blocks):
            assert block.split('\n', 1)[0].strip().endswith(variant['graph'])
            perf = PERF.findall(block)
            artifact = json.loads((directory / 'corpus' / variant['script']).with_suffix('.json').read_text())
            rows[variant['graph']] = {'task': directory.name, 'script': str(directory / 'corpus' / variant['script']),
                                      'gpu_ms': json.loads(perf[0])['gpu']['median'] if perf else None,
                                      'kernels': [k['identity'] + ':' + k['row'] for k in artifact['kernels']]}
    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__); p.add_argument('--output', type=Path, required=True); a = p.parse_args()
    base, cand = arm('baseline'), arm('candidate')
    changed = [g for g in base if g in cand and base[g]['kernels'] != cand[g]['kernels'] and base[g]['gpu_ms'] and cand[g]['gpu_ms']]
    program = str(STUDY / 'fixed-program.json')
    jobs = [{'id': 2 * i, 'script': base[g]['script']} for i, g in enumerate(changed)] + \
           [{'id': 2 * i + 1, 'script': cand[g]['script'], 'program': program} for i, g in enumerate(changed)]
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / 'jobs.json').write_text(json.dumps(jobs))
        subprocess.run(['node', str(Path(__file__).with_name('664-predict-program-cost.mjs')), str(Path(tmp) / 'jobs.json'), str(Path(tmp) / 'out.json')], check=True)
        pred = {r['id']: r for r in json.loads((Path(tmp) / 'out.json').read_text())}
    rows = []
    for i, g in enumerate(changed):
        b, c = pred[2 * i], pred[2 * i + 1]
        if 'error' in b or 'error' in c: rows.append({'graph': g, 'error': b.get('error') or c.get('error')}); continue
        rows.append({'graph': g, 'task': base[g]['task'], 'measured_ratio': cand[g]['gpu_ms'] / base[g]['gpu_ms'],
                     'a100_ratio': c['predicted_us'] / b['predicted_us'], 'gb10_ratio': c['predicted_gb10_us'] / b['predicted_gb10_us'],
                     'work_ratio': c['work'] / b['work'], 'kernels': [b['kernels'], c['kernels']]})
    ok = [r for r in rows if 'error' not in r]
    sign = lambda x: (x > 1.02) - (x < 0.98)
    summary = {'changed_graphs': len(changed), 'predicted': len(ok)}
    for model in ('a100_ratio', 'gb10_ratio', 'work_ratio'):
        decisive = [r for r in ok if sign(r['measured_ratio']) != 0]
        summary[model] = {'spearman': calib.spearman([r[model] for r in ok], [r['measured_ratio'] for r in ok]),
                          'sign_agreement_on_measured_changes': sum(sign(r[model]) == sign(r['measured_ratio']) for r in decisive),
                          'measured_changes_beyond_2pct': len(decisive)}
    a.output.write_text(json.dumps({'format': 'kiln-paired-cost-model-check/1', 'summary': summary, 'rows': rows}, indent=1) + '\n')
    print(json.dumps(summary, indent=1))
    for r in sorted(ok, key=lambda r: r['measured_ratio']):
        print(f"{r['task']} measured {r['measured_ratio']:.3f} a100 {r['a100_ratio']:.3f} gb10 {r['gb10_ratio']:.3f} work {r['work_ratio']:.3f} kernels {r['kernels'][0]}->{r['kernels'][1]}")


if __name__ == '__main__':
    main()
