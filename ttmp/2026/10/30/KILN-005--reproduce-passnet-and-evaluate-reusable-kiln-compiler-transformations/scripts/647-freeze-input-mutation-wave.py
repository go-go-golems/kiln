"""Freeze the full-corpus mutation import delta and complete-family task plan."""

import collections
import hashlib
import json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
sources = ticket / 'sources'
upstream = sources / 'upstream'
before_path = sources / 'stack-unbind-batch-import-v1.json'
after_path = sources / 'input-mutation-wave-import-v1.json'
before = json.loads(before_path.read_text())['records']
after = json.loads(after_path.read_text())['records']
prior = collections.defaultdict(list)
current = collections.defaultdict(list)
for row in before:
    prior[row['sample']].append(row)
for row in after:
    current[row['sample']].append(row)
assert set(prior) == set(current) and len(before) == len(after) == 2060
old = {row['graph']: row for row in before}
new = {row['graph']: row for row in after}
assert old.keys() == new.keys()
newly_imported = [graph for graph in old if old[graph]['status'] != 'imported' and new[graph]['status'] == 'imported']
regressed = [graph for graph in old if old[graph]['status'] == 'imported' and new[graph]['status'] != 'imported']
assert not regressed, f'Import regressions: {regressed[:3]}'
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
tasks = []
for index, sample in enumerate(samples):
    if not all(row['status'] == 'imported' for row in current[sample]) or all(row['status'] == 'imported' for row in prior[sample]):
        continue
    membership = (upstream / sample / 'graph_list.txt').read_bytes()
    graphs = membership.decode().splitlines()
    assert graphs == [row['graph'] for row in current[sample]]
    tasks.append({'index': index, 'sample': sample, 'graphs': len(graphs),
                  'graph_list_sha256': hashlib.sha256(membership).hexdigest()})
result = {'format': 'kiln-input-mutation-import-delta/1',
          'before_audit_sha256': hashlib.sha256(before_path.read_bytes()).hexdigest(),
          'after_audit_sha256': hashlib.sha256(after_path.read_bytes()).hexdigest(),
          'before_imported': sum(row['status'] == 'imported' for row in before),
          'after_imported': sum(row['status'] == 'imported' for row in after),
          'before_complete_tasks': sum(all(row['status'] == 'imported' for row in rows) for rows in prior.values()),
          'after_complete_tasks': sum(all(row['status'] == 'imported' for row in rows) for rows in current.values()),
          'newly_imported_graphs': newly_imported, 'regressed_graphs': regressed,
          'new_complete_tasks': tasks}
(sources / 'input-mutation-wave-delta-v1.json').write_text(json.dumps(result, indent=2) + '\n')
plan = {'format': 'kiln-task-plan/1', 'selection':
        'Every complete family newly importable after guarded input mutation; all graph variants retained.',
        'nominal_tolerance': -5, 'target': 'a100',
        'hardware': 'NVIDIA GB10; modified FX matching integration protocol',
        'contraction': 'separate', 'skip_internal_reference_check': True,
        'audit_sha256': result['after_audit_sha256'], 'tasks': tasks}
(sources / 'input-mutation-wave-task-plan-v1.json').write_text(json.dumps(plan, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ('newly_imported_graphs', 'new_complete_tasks', 'regressed_graphs')} | {'task_indices': [row['index'] for row in tasks],
                                                                                                        'new_graphs': len(newly_imported)}, indent=2))
