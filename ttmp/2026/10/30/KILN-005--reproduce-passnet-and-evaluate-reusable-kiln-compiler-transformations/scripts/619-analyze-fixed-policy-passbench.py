"""Compare frozen task acceptance, official scores, and paired accepted timings."""
import contextlib
import hashlib
import io
import json
import math
import sys
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
study = ticket / 'sources/fixed-policy-passbench-v1'
sys.path.insert(0, str(ticket / 'sources/upstream'))
from pass_bench.analysis_util import parse_logs_to_data

def read(path):
    return json.loads(path.read_text())

def graph_data(arm):
    root = study / arm
    run, audit = read(root / 'run.json'), read(study / (arm + '-audit.json'))
    assert run['status'] == 'complete' and audit['tasks_expected'] == 12
    result = {}
    for task in audit['records']:
        directory = root / f"task-{task['index']:03d}"
        manifest, receipt = read(directory / 'corpus/manifest.json'), read(directory / 'corpus/compile-receipt.json')
        with contextlib.redirect_stdout(io.StringIO()):
            parsed = parse_logs_to_data(str(directory / 'benchmark.log'))
        assert len(task['graphs']) == len(parsed) == len(manifest['variants']) == len(receipt)
        for verdict, sample, variant, compiled in zip(task['graphs'], parsed, manifest['variants'], receipt):
            graph = verdict['graph']
            assert graph == sample['model_path'].removeprefix('/work/upstream/') == variant['graph'] == compiled['graph']
            artifact = read(directory / 'corpus' / compiled['artifact']) if compiled['returncode'] == 0 else None
            executable = None if artifact is None else {key: artifact[key] for key in ('inputs', 'outputs', 'buffers', 'kernels')}
            timing = None
            if verdict['nominal_accepted']:
                perf = sample['performance']
                compiled_perf = json.loads(perf['compiled'])
                timing = {'e2e_ms': compiled_perf['e2e']['median'], 'gpu_ms': compiled_perf['gpu']['median'],
                          'e2e_iqr_fraction': compiled_perf['e2e']['iqr'] / compiled_perf['e2e']['median']}
            result[graph] = {'task': task['index'], 'accepted': verdict['nominal_accepted'],
                             'matches': verdict.get('matches'), 'timing': timing,
                             'executable_sha256': None if executable is None else hashlib.sha256(json.dumps(executable, sort_keys=True).encode()).hexdigest()}
    return run, audit, result

base_run, base_audit, base = graph_data('baseline')
candidate_run, candidate_audit, candidate = graph_data('candidate')
assert base.keys() == candidate.keys()
assert base_run['source_snapshot'] == candidate_run['source_snapshot']
assert base_run['image_id'] == candidate_run['image_id'] and base_run['node_version'] == candidate_run['node_version']
assert base_run['plan']['tasks'] == candidate_run['plan']['tasks']
assert base_run['optimization_program_sha256'] is None
assert candidate_run['optimization_program_sha256'] == hashlib.sha256((study / 'fixed-program.json').read_bytes()).hexdigest()

base_tasks = {row['index']: row for row in base_audit['records']}
candidate_tasks = {row['index']: row for row in candidate_audit['records']}
graphs = []
by_task = {}
for graph, before in base.items():
    after = candidate[graph]
    assert before['task'] == after['task']
    task = before['task']
    row = {'graph': graph, 'task': task, 'baseline_accepted': before['accepted'],
           'candidate_accepted': after['accepted'], 'baseline_matches': before['matches'],
           'candidate_matches': after['matches'],
           'executable_changed': before['executable_sha256'] != after['executable_sha256'],
           'baseline_executable_sha256': before['executable_sha256'],
           'candidate_executable_sha256': after['executable_sha256']}
    if before['accepted'] and after['accepted']:
        row['e2e_speedup'] = before['timing']['e2e_ms'] / after['timing']['e2e_ms']
        row['gpu_speedup'] = before['timing']['gpu_ms'] / after['timing']['gpu_ms']
        row['baseline_timing'] = before['timing']
        row['candidate_timing'] = after['timing']
    graphs.append(row)
    by_task.setdefault(task, []).append(row)

def geometric(values):
    return math.exp(sum(math.log(value) for value in values) / len(values)) if values else None

tasks = []
for index, rows in by_task.items():
    common = [row for row in rows if 'e2e_speedup' in row]
    tasks.append({'index': index, 'graphs': len(rows),
                  'baseline_accepted': sum(row['baseline_accepted'] for row in rows),
                  'candidate_accepted': sum(row['candidate_accepted'] for row in rows),
                  'executable_changed': sum(row['executable_changed'] for row in rows),
                  'baseline_score': base_tasks[index]['score']['score'] if base_tasks[index]['score'] else None,
                  'candidate_score': candidate_tasks[index]['score']['score'] if candidate_tasks[index]['score'] else None,
                  'common_correct_e2e_geomean': geometric([row['e2e_speedup'] for row in common]),
                  'common_correct_gpu_geomean': geometric([row['gpu_speedup'] for row in common]),
                  'changed_common_correct_e2e_geomean': geometric([row['e2e_speedup'] for row in common if row['executable_changed']]),
                  'changed_common_correct_gpu_geomean': geometric([row['gpu_speedup'] for row in common if row['executable_changed']])})
transfer = [row for row in tasks if row['index'] != 101]
result = {'format': 'kiln-fixed-policy-passbench-comparison/1',
          'scope': 'Sequential GB10 task comparison under modified FX matcher integration; task101 development control, other tasks transfer',
          'source_snapshot_sha256': base_audit['source_snapshot_sha256'],
          'tasks': len(tasks), 'graphs': len(graphs),
          'baseline_tasks_accepted': base_audit['tasks_nominal_accepted'],
          'candidate_tasks_accepted': candidate_audit['tasks_nominal_accepted'],
          'baseline_graphs_accepted': base_audit['graphs_nominal_accepted'],
          'candidate_graphs_accepted': candidate_audit['graphs_nominal_accepted'],
          'executables_changed': sum(row['executable_changed'] for row in graphs),
          'transfer_tasks': len(transfer),
          'transfer_baseline_score_mean': sum(row['baseline_score'] for row in transfer) / len(transfer),
          'transfer_candidate_score_mean': sum(row['candidate_score'] for row in transfer) / len(transfer),
          'transfer_common_correct_e2e_family_geomean': geometric([row['common_correct_e2e_geomean'] for row in transfer if row['common_correct_e2e_geomean']]),
          'transfer_changed_common_correct_e2e_family_geomean': geometric([row['changed_common_correct_e2e_geomean'] for row in transfer if row['changed_common_correct_e2e_geomean']]),
          'limitations': ['Task101 was used during policy development.', 'Other tasks had some prior Kiln coverage work.',
                          'Sequential control then candidate measurements may drift.',
                          'Common-correct speedups exclude failures; task scores retain their penalty.'],
          'task_records': tasks, 'graph_records': graphs}
(study / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ('task_records', 'graph_records')}, indent=2))
