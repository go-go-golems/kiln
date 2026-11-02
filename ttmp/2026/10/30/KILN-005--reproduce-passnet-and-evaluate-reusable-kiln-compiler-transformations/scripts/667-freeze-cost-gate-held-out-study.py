#!/usr/bin/env python3
"""Freeze the held-out three-arm cost-gate study before compiling or measuring any arm on the GPU.

Population: every complete family of the uniform qualification (ordinary + regression bands)
outside reference 35's twelve tasks whose exported kernels change under fixed-program.json
(compile-only census, script 666). Arms share everything except the optimization program:
  baseline  - standard pipeline
  always    - fixed-program.json applied to every graph (reference 35's candidate)
  gated     - the same program inside a cost gate (kind cost-gated, strict predicted-cost rule)
"""
import hashlib, json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
sources = ticket / 'sources'
upstream = sources / 'upstream'
destination = sources / 'cost-gate-held-out-v1'
census = json.loads((destination / 'census.json').read_text())
assert census['format'] == 'kiln-held-out-gate-census/1' and all(f['errors'] == 0 for f in census['families'])
chosen = [f for f in census['families'] if f['changed']]
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
tasks = []
for family in chosen:
    sample = samples[family['task']]
    membership = (upstream / sample / 'graph_list.txt').read_bytes()
    graphs = membership.decode().splitlines()
    assert len(graphs) == family['graphs'] and all((upstream / g).is_dir() for g in graphs)
    tasks.append({'index': family['task'], 'sample': sample, 'graphs': len(graphs),
                  'graph_list_sha256': hashlib.sha256(membership).hexdigest()})
program = json.loads((sources / 'fixed-policy-passbench-v1/fixed-program.json').read_text())
gate = {'format': 'kiln-transformation-program/1', 'id': 'cost-gated-fixed-program', 'kind': 'cost-gated', 'program': program}
(destination / 'always-program.json').write_text(json.dumps(program, indent=2) + '\n')
(destination / 'gated-program.json').write_text(json.dumps(gate, indent=2) + '\n')
common = {'format': 'kiln-task-plan/1',
          'selection': 'Held-out cost-gate population: complete uniform-qualification families outside reference 35 whose kernels change under fixed-program.json (compile-only census 666).',
          'nominal_tolerance': -5, 'target': 'a100', 'hardware': 'NVIDIA GB10; modified FX matcher integration protocol',
          'contraction': 'separate', 'skip_internal_reference_check': True,
          'census_sha256': hashlib.sha256((destination / 'census.json').read_bytes()).hexdigest(), 'tasks': tasks}
arms = {'baseline': common, 'always': common | {'optimization_program': 'always-program.json'},
        'gated': common | {'optimization_program': 'gated-program.json'}}
for name, plan in arms.items():
    (destination / f'{name}-plan.json').write_text(json.dumps(plan, indent=2) + '\n')
declaration = {
    'format': 'kiln-study-declaration/1', 'study': 'cost-gate-held-out-v1',
    'hypothesis': 'Gating fixed-program.json on predicted schedule cost improves measured compiled GPU time over always applying it, without losing correctness.',
    'arm_order': ['baseline', 'always', 'gated'],
    'primary_endpoint': 'Family-balanced geometric mean of measured compiled GPU median ratio (arm / baseline) over graphs whose always-arm kernels change and that are nominally accepted in all three arms; compare gated vs always.',
    'secondary_endpoints': ['Official PassBench task score per arm (original scorer)',
                            'Nominally accepted graphs and complete families per arm',
                            'Same endpoint restricted to graphs where the gate chose differently from always',
                            'Same endpoint on end-to-end medians'],
    'decision_rule': 'Claim the gate as a reusable strategy only if the gated GM is below the always GM, the gated GM is at or below 1.0, and gated accepts no fewer graphs than baseline.',
    'known_limitations': ['Arms run sequentially in the declared order; clock or thermal drift is not randomized.',
                          'The census used the uniform snapshot (0c17cee) staged scripts; the run regenerates scripts with the staged snapshot and records each gate decision in the artifacts.',
                          'Task 106-type mispredictions are expected to appear; they are part of the measured effect.'],
    'families': len(tasks), 'graphs': sum(t['graphs'] for t in tasks),
    'census_changed_graphs': sum(f['changed'] for f in chosen),
    'census_gate_differs_from_always': sum(f['changed'] - f['gate_transformed'] for f in chosen),
    'program_sha256': {name: hashlib.sha256((destination / f'{name}-program.json').read_bytes()).hexdigest() for name in ['always', 'gated']},
}
(destination / 'declaration.json').write_text(json.dumps(declaration, indent=2) + '\n')
print(json.dumps({k: declaration[k] for k in ['families', 'graphs', 'census_changed_graphs', 'census_gate_differs_from_always', 'program_sha256']}, indent=2))
