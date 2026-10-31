#!/usr/bin/env python3
"""Regenerate frozen-plan tasks into a fresh directory and simulate PassBench rule
selection on CPU: for every graph, the first rule (in sorted_output_pass_rule_names
order) whose pattern matches with the upstream SubgraphMatcher settings must carry
the graph's own compiled specialization identity, and must match exactly once.

This checks the rule-selection contract only. With --trace dynamo (default) target
graphs are captured by TorchDynamo on meta tensors, as the evaluator's torch.compile
backend receives them; --trace symbolic uses torch.fx.symbolic_trace. It is a
matcher-identity simulation, not PassBench evidence; numerical acceptance still
requires the original evaluator on CUDA.

usage: 658-simulate-pattern-dispatch-identity.py --plan PLAN --upstream UPSTREAM
         --output OUT --task 6 --task 24 ...
"""
import argparse, importlib.util, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(ROOT / 'integrations/passnet'))
import torch
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from corpus import eliminate_dead_code, export_task, load_module, read_manifest
from generate_pass import generate
from fx_normalize import normalize_arguments, trace_pattern


def load_rule(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.pop(0)
    return module


def dynamo_graph(directory):
    model = load_module(directory / 'model.py').GraphModule()
    metadata = []
    for filename in ('input_meta.py', 'weight_meta.py'):
        module = load_module(directory / filename)
        metadata.extend(c for c in vars(module).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
    metadata.sort(key=lambda c: int(c.name.split('_')[-1]))
    inputs = [torch.empty(c.shape, dtype=getattr(torch, c.dtype.split('.')[-1]), device='meta') for c in metadata]
    graphs = []
    def capture(gm, example):
        graphs.append(gm)
        return gm.forward
    torch._dynamo.reset()
    torch.compile(model, backend=capture, dynamic=False, fullgraph=True)(*inputs)
    if len(graphs) != 1:
        raise RuntimeError(f'expected one captured graph, got {len(graphs)}')
    return graphs[0]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan', type=Path, required=True)
    p.add_argument('--upstream', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--task', type=int, action='append', required=True)
    p.add_argument('--trace', choices=('dynamo', 'symbolic'), default='dynamo')
    a = p.parse_args()
    if a.output.exists():
        raise SystemExit(f'{a.output} exists; choose a fresh directory')
    plan = json.loads(a.plan.read_text())
    by_index = {t['index']: t for t in plan['tasks']}
    report = {'format': 'kiln-pattern-identity-simulation/1', 'plan': str(a.plan), 'trace': a.trace, 'tasks': []}
    for index in a.task:
        task = by_index[index]
        corpus = a.output / f'task{index:03d}' / 'corpus'
        passes = a.output / f'task{index:03d}' / 'passes'
        export_task(a.upstream, task['sample'], corpus)
        generate(corpus, a.upstream, passes, corpus)
        names = json.loads((passes / 'sorted_output_pass_rule_names.json').read_text())
        rules = []
        for name in names:
            # stub the runtime import; matching never calls the replacement
            (passes / '_kiln_generated_runtime.py').write_text('def kiln_generated(*args):\n raise RuntimeError("simulation")\n')
            module = load_rule(passes / f'{name}.py')
            pattern = trace_pattern(module.pattern)
            normalize_arguments(pattern)
            rules.append((int(name.removeprefix('KilnPattern')), pattern))
        graphs = []
        for record in read_manifest(corpus)['variants']:
            if a.trace == 'dynamo':
                gm = dynamo_graph(a.upstream / record['graph'])
            else:
                gm = torch.fx.symbolic_trace(load_module(a.upstream / record['graph'] / 'model.py').GraphModule())
                eliminate_dead_code(gm.graph)  # TorchDynamo captures only live nodes
            normalize_arguments(gm)
            applied, count, errors = None, 0, {}
            for identity, pattern in rules:
                try:
                    matches = SubgraphMatcher(pattern.graph, match_output=False, match_placeholder=False,
                                              remove_overlapping_matches=True, ignore_literals=False).match(gm.graph)
                except Exception as error:  # the evaluator reports these per rule; keep them
                    errors[identity] = f'{type(error).__name__}: {error}'
                    continue
                if matches and applied is None:
                    applied, count = identity, len(matches)
            graphs.append({'graph': record['graph'], 'compiled': record['specialization'][0], 'applied': applied,
                           'matches': count, 'output_permutation': record.get('output_permutation', [0]),
                           'rule_errors': errors, 'ok': applied == record['specialization'][0] and count == 1})
        report['tasks'].append({'index': index, 'graphs': len(graphs), 'rules': len(rules),
                                'identity_ok': sum(g['ok'] for g in graphs),
                                'permuted': sum(g['output_permutation'] != sorted(g['output_permutation']) for g in graphs),
                                'records': graphs})
        print(index, f"{report['tasks'][-1]['identity_ok']}/{len(graphs)} identity ok;", len(rules), 'rules;',
              report['tasks'][-1]['permuted'], 'permuted', flush=True)
    (a.output / 'simulation.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
