"""Freeze complete PassBench transfer tasks before compiling either policy arm."""
import hashlib
import json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
sources = ticket / 'sources'
upstream = sources / 'upstream'
destination = sources / 'fixed-policy-passbench-v1'
destination.mkdir(exist_ok=True)
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
indices = [7, 25, 74, 83, 89, 101, 106, 107, 127, 149, 159, 165]
tasks = []
for index in indices:
    sample = samples[index]
    membership = (upstream / sample / 'graph_list.txt').read_bytes()
    graphs = membership.decode().splitlines()
    assert graphs and all((upstream / graph).is_dir() for graph in graphs)
    tasks.append({'index': index, 'sample': sample, 'graphs': len(graphs),
                  'graph_list_sha256': hashlib.sha256(membership).hexdigest()})
common = {'format': 'kiln-task-plan/1', 'selection':
          'Declared complete-task transfer population; task 101 is prior development positive control.',
          'nominal_tolerance': -5, 'target': 'a100',
          'hardware': 'NVIDIA GB10; modified FX matcher integration protocol',
          'contraction': 'separate', 'skip_internal_reference_check': True,
          'tasks': tasks}
policy_source = sources / 'pointwise-agent-development-v1/pointwise.json'
policy = json.loads(policy_source.read_text())
assert policy['format'] == 'kiln-transformation-program/1'
(destination / 'fixed-program.json').write_text(json.dumps(policy, indent=2) + '\n')
for name, plan in [('baseline', common), ('candidate', common | {'optimization_program': 'fixed-program.json'})]:
    (destination / f'{name}-plan.json').write_text(json.dumps(plan, indent=2) + '\n')
print(json.dumps({'tasks': len(tasks), 'graphs': sum(t['graphs'] for t in tasks),
                  'positive_control': 101, 'transfer_tasks': len(tasks) - 1,
                  'policy_sha256': hashlib.sha256((destination / 'fixed-program.json').read_bytes()).hexdigest()}, indent=2))
