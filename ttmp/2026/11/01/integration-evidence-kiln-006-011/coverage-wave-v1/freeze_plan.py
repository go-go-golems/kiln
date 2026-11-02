"""Freeze the coverage-wave replay plan (kiln-task-plan/1) for the given task indices.

Usage: python3 freeze_plan.py UPSTREAM CENSUS.json[.gz] OUT/plan.json INDEX...
The header copies sources/mutation-inplace-replay-v1/plan.json (a100, contraction separate, tf32,
skip_internal_reference_check, mutation_strategy auto); import_census_sha256 is the sha256 of the given
census file's bytes. Each task: index, sample, graphs, graph_list_sha256 = sha256(upstream/<sample>/graph_list.txt).
Refuses to overwrite an existing plan (frozen evidence is append-only).
"""
import hashlib, json, sys, pathlib
upstream, census, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
indices = [int(i) for i in sys.argv[4:]]
if out.exists(): raise SystemExit(f'{out} exists: frozen plans are not rewritten')
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
tasks = []
for i in indices:
    raw = (upstream / samples[i] / 'graph_list.txt').read_bytes()
    tasks.append({'index': i, 'sample': samples[i], 'graphs': len([g for g in raw.decode().splitlines() if g.strip()]),
                  'graph_list_sha256': hashlib.sha256(raw).hexdigest()})
plan = {
    'format': 'kiln-task-plan/1',
    'band': 'coverage-wave-replay',
    'selection': 'Integration Steps 9-11 coverage wave (integration/kiln-006-011): families of hf_fusible_eval_samples_v2 that the '
                 'Step 8 census blocked completely and that now import completely, pass the CPU numerical check against eager '
                 'PyTorch (frontend and Loop IR) and the CPU local compile gate (internal reference check on). Compiled with '
                 '--mutation-strategy auto. Dynamo matcher simulation: see coverage-wave-v1/gates.json (blocked on CPU for '
                 'graphs that move tensors to cuda).',
    'nominal_tolerance': -5,
    'target': 'a100',
    'hardware': 'NVIDIA GB10; modified FX matching integration protocol',
    'contraction': 'separate',
    'skip_internal_reference_check': True,
    'matmul_precision': 'tf32',
    'import_census_sha256': hashlib.sha256(census.read_bytes()).hexdigest(),
    'mutation_strategy': 'auto',
    'tasks': tasks,
}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(plan, indent=2) + '\n')
print(len(tasks), 'tasks,', sum(t['graphs'] for t in tasks), 'graphs ->', out)
