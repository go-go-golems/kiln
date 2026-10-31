#!/usr/bin/env python3
"""Analyze the three collected arms of cost-gate-held-out-v1 against its frozen declaration.

Written before any arm finished. Per graph: acceptance, compiled GPU and end-to-end medians, the
executable hash (inputs/outputs/buffers/kernels) and, for the gated arm, the recorded gate choice.
Primary endpoint (declaration.json): family-balanced geometric mean of arm/baseline compiled GPU
median over graphs whose always-arm executable differs from baseline and that all three arms
accept. Ratios below 1 are faster than baseline.
"""
import contextlib, hashlib, io, json, math, sys
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
study = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ticket / 'sources/cost-gate-held-out-v1'
sys.path.insert(0, str(ticket / 'sources/upstream'))
from pass_bench.analysis_util import parse_logs_to_data

ARMS = ['baseline', 'always', 'gated']
read = lambda p: json.loads(p.read_text())


def graph_data(arm):
    root, audit = study / arm, read(study / f'{arm}-audit.json')
    run = read(root / 'run.json')
    assert run['status'] == 'complete' and audit['unexecuted_graphs'] == 0
    out = {}
    for task in audit['records']:
        d = root / f"task-{task['index']:03d}"
        manifest, receipt = read(d / 'corpus/manifest.json'), read(d / 'corpus/compile-receipt.json')
        with contextlib.redirect_stdout(io.StringIO()):
            parsed = parse_logs_to_data(str(d / 'benchmark.log'))
        assert len(task['graphs']) == len(parsed) == len(manifest['variants']) == len(receipt)
        for verdict, sample, variant, compiled in zip(task['graphs'], parsed, manifest['variants'], receipt):
            graph = verdict['graph']
            assert graph == sample['model_path'].removeprefix('/work/upstream/') == variant['graph'] == compiled['graph']
            artifact = read(d / 'corpus' / compiled['artifact']) if compiled['returncode'] == 0 else None
            executable = None if artifact is None else {k: artifact[k] for k in ('inputs', 'outputs', 'buffers', 'kernels')}
            timing = None
            if verdict['nominal_accepted']:
                perf = json.loads(sample['performance']['compiled'])
                timing = {'gpu_ms': perf['gpu']['median'], 'e2e_ms': perf['e2e']['median']}
            out[graph] = {'task': task['index'], 'accepted': verdict['nominal_accepted'], 'timing': timing,
                          'executable_sha256': None if executable is None else hashlib.sha256(json.dumps(executable, sort_keys=True).encode()).hexdigest(),
                          'decision': (artifact or {}).get('compiler_policy_decision')}
    return run, audit, out


def gm(xs):
    return math.exp(sum(map(math.log, xs)) / len(xs)) if xs else None


def family_balanced(rows, key):
    families = {}
    for r in rows: families.setdefault(r['task'], []).append(r[key])
    return gm([gm(v) for v in families.values()]), len(families), len(rows)


def main():
    declaration = read(study / 'declaration.json')
    data = {arm: graph_data(arm) for arm in ARMS}
    runs = {arm: data[arm][0] for arm in ARMS}
    for arm in ARMS[1:]:
        for key in ('source_snapshot', 'image_id', 'node_version'):
            assert runs[arm][key] == runs['baseline'][key], (arm, key)
        assert runs[arm]['plan']['tasks'] == runs['baseline']['plan']['tasks']
    assert runs['baseline']['optimization_program_sha256'] is None
    for arm in ARMS[1:]:
        assert runs[arm]['optimization_program_sha256'] == declaration['program_sha256'][arm]
    graphs = {arm: data[arm][2] for arm in ARMS}
    assert graphs['baseline'].keys() == graphs['always'].keys() == graphs['gated'].keys()
    rows = []
    for g, b in graphs['baseline'].items():
        a, c = graphs['always'][g], graphs['gated'][g]
        row = {'graph': g, 'task': b['task'], **{f'{arm}_accepted': graphs[arm][g]['accepted'] for arm in ARMS},
               'changed': b['executable_sha256'] != a['executable_sha256'],
               'gate_choice': (c['decision'] or {}).get('chosen'),
               'gated_matches_always': c['executable_sha256'] == a['executable_sha256'],
               'gated_matches_baseline': c['executable_sha256'] == b['executable_sha256']}
        if all(graphs[arm][g]['accepted'] for arm in ARMS):
            for arm in ARMS[1:]:
                for unit in ('gpu', 'e2e'):
                    row[f'{arm}_{unit}_ratio'] = graphs[arm][g]['timing'][f'{unit}_ms'] / b['timing'][f'{unit}_ms']
        rows.append(row)
    # the gate must pick exactly one of the two arms' executables
    consistency = sum(1 for r in rows if r['gate_choice'] == 'transformed' and not r['gated_matches_always']
                      or r['gate_choice'] == 'baseline' and not r['gated_matches_baseline'])
    changed = [r for r in rows if r['changed'] and 'always_gpu_ratio' in r]
    differs = [r for r in changed if r['gate_choice'] == 'baseline']
    summary = {'graphs': len(rows), 'changed_graphs': sum(r['changed'] for r in rows),
               'changed_accepted_all_arms': len(changed), 'gate_chose_baseline_on_changed': len(differs),
               'gate_executable_inconsistencies': consistency,
               'accepted': {arm: sum(r[f'{arm}_accepted'] for r in rows) for arm in ARMS},
               'complete_families': {arm: data[arm][1]['tasks_nominal_accepted'] for arm in ARMS},
               'official_score_mean': {arm: (lambda s: sum(s) / len(s) if s else None)(
                   [t['score']['score'] for t in data[arm][1]['records'] if t['score']]) for arm in ARMS}}
    for arm in ARMS[1:]:
        for unit in ('gpu', 'e2e'):
            summary[f'{arm}_{unit}_family_gm'] = family_balanced(changed, f'{arm}_{unit}_ratio')
            summary[f'{arm}_{unit}_family_gm_where_gate_differs'] = family_balanced(differs, f'{arm}_{unit}_ratio') if differs else None
    g, a = summary['gated_gpu_family_gm'][0], summary['always_gpu_family_gm'][0]
    summary['decision'] = {'gated_below_always': g < a, 'gated_at_or_below_one': g <= 1.0,
                           'gated_accepts_no_fewer_than_baseline': summary['accepted']['gated'] >= summary['accepted']['baseline']}
    summary['decision']['claim_supported'] = all(summary['decision'].values())
    families = {}
    for r in changed: families.setdefault(r['task'], []).append(r)
    per_family = [{'task': t, 'changed_accepted': len(v), 'gate_baseline': sum(r['gate_choice'] == 'baseline' for r in v),
                   'always_gpu_gm': gm([r['always_gpu_ratio'] for r in v]), 'gated_gpu_gm': gm([r['gated_gpu_ratio'] for r in v])}
                  for t, v in sorted(families.items())]
    (study / 'comparison.json').write_text(json.dumps({'format': 'kiln-three-arm-comparison/1', 'summary': summary,
                                                       'families': per_family, 'graphs': rows}, indent=1) + '\n')
    print(json.dumps(summary, indent=1))
    for f in per_family: print(f)


if __name__ == '__main__':
    main()
