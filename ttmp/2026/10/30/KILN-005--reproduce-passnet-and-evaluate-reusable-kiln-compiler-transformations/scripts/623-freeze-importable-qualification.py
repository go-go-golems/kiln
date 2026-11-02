"""Freeze every currently fully importable evaluation task for uniform replay."""
import collections
import hashlib
import json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
sources = ticket / 'sources'
upstream = sources / 'upstream'
destination = sources / 'uniform-importable-qualification-v1'
destination.mkdir(exist_ok=True)
audit_path = sources / 'coverage-roadmap-import-audit-v1.json'
coverage_path = sources / 'kiln-coverage.json'
audit = json.loads(audit_path.read_text())
coverage = json.loads(coverage_path.read_text())
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
by_sample = collections.defaultdict(list)
for row in audit['records']:
    by_sample[row['sample']].append(row)
verified = {row['task'] for row in coverage['records'] if row['status'] == 'verified_modified_protocol'}
eligible = {sample: rows for sample, rows in by_sample.items() if all(row['status'] == 'imported' for row in rows)}
assert len(samples) == 200 and len(eligible) == 111 and len(verified) == 53 and verified <= eligible.keys()

def task(sample):
    graph_list = (upstream / sample / 'graph_list.txt').read_bytes()
    graphs = graph_list.decode().splitlines()
    assert len(graphs) == len(eligible[sample])
    assert graphs == [row['graph'] for row in eligible[sample]]
    return {'index': samples.index(sample), 'sample': sample, 'graphs': len(graphs),
            'graph_list_sha256': hashlib.sha256(graph_list).hexdigest()}

pending = sorted((task(sample) for sample in eligible if sample not in verified),
                 key=lambda row: (-row['graphs'], row['index']))
assert [row['graphs'] for row in pending[:2]] == [396, 126]
bands = {'pending-ordinary': sorted(pending[2:], key=lambda row: row['index']),
         'pending-large': sorted(pending[:2], key=lambda row: row['index']),
         'regression': sorted((task(sample) for sample in verified), key=lambda row: row['index'])}
assert [len(rows) for rows in bands.values()] == [56, 2, 53]
assert [sum(row['graphs'] for row in rows) for rows in bands.values()] == [561, 522, 431]
common = {'format': 'kiln-task-plan/1', 'selection':
          'All current-source fully importable evaluation families; three scheduling bands, no omitted graph variants.',
          'nominal_tolerance': -5, 'target': 'a100',
          'hardware': 'NVIDIA GB10; modified FX matching integration protocol',
          'contraction': 'separate', 'skip_internal_reference_check': True,
          'source_audit_sha256': hashlib.sha256(audit_path.read_bytes()).hexdigest(),
          'coverage_ledger_sha256': hashlib.sha256(coverage_path.read_bytes()).hexdigest()}
for name, rows in bands.items():
    (destination / f'{name}-plan.json').write_text(json.dumps(common | {'band': name, 'tasks': rows}, indent=2) + '\n')
receipt = {'format': 'kiln-uniform-importable-qualification/1',
           'source_audit_sha256': common['source_audit_sha256'],
           'coverage_ledger_sha256': common['coverage_ledger_sha256'],
           'bands': {name: {'tasks': len(rows), 'graphs': sum(row['graphs'] for row in rows)} for name, rows in bands.items()},
           'total_tasks': sum(len(rows) for rows in bands.values()),
           'total_graphs': sum(row['graphs'] for rows in bands.values() for row in rows)}
(destination / 'declaration.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
