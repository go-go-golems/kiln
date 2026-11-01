#!/usr/bin/env python3
"""Phase 4 agreement scan (KILN-009) over every graph of the 200 PassBench eval samples.

For each graph: the kept in-place statements with unused results that the pattern returns
(generate_pass.drop_dead_statements, AST side) must be, in order and by operation, the nodes
the compiled program returns (corpus.eliminate_dead_code + expose_inplace_results, FX side);
otherwise output_permutation raises 'Rule and variant return different values'. Also lists
graphs whose source calls a comparison dunder by name (fx_normalize.DUNDER_ALIASES), and writes
a 658-compatible plan of the samples either change can affect.

usage: 07-census-inplace-agreement.py --upstream DIR --output report.json --plan plan.json
"""
import argparse, ast, json, re, sys, traceback
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
ROOT = TICKET.parents[4]
sys.path.insert(0, str(ROOT / 'integrations/passnet'))
import generate_pass
from corpus import load_module, eliminate_dead_code, expose_inplace_results
from fx_trace import trace_module

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--upstream', required=True, type=Path)
p.add_argument('--output', required=True, type=Path)
p.add_argument('--plan', required=True, type=Path)
a = p.parse_args()
samples = (a.upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
DUNDER = re.compile(r'\.__(eq|ne|lt|le|gt|ge)__\(')

def ast_op(statement):
    call = statement.value
    if isinstance(call.func, ast.Name) and call.func.id == 'kiln_iadd': return 'iadd'
    if isinstance(call.func, ast.Attribute): return call.func.attr
    return ast.unparse(call.func).split('.')[-1]

def fx_op(node):
    return node.target if isinstance(node.target, str) else getattr(node.target, '__name__', str(node.target))

captured = []
original = generate_pass.drop_dead_statements
def recording(function):
    unused = original(function)
    ops = {s.targets[0].id: ast_op(s) for s in function.body[:-1] if isinstance(s, ast.Assign) and len(s.targets) == 1 and isinstance(s.targets[0], ast.Name) and s.targets[0].id in unused}
    captured.append([ops[n] for n in unused])
    return unused
generate_pass.drop_dead_statements = recording

rows, affected = [], {}
for index, sample in enumerate(samples):
    for graph in (a.upstream / sample / 'graph_list.txt').read_text().split():
        source = (a.upstream / graph / 'model.py').read_text()
        row = {'index': index, 'graph': graph, 'dunder': sorted(set(DUNDER.findall(source)))}
        try:
            arity = len(ast.parse(source).body[[isinstance(n, ast.ClassDef) for n in ast.parse(source).body].index(True)].body[0].args.args) - 1
            captured.clear(); generate_pass.extract_pattern(source, arity); row['ast'] = captured[0]
        except Exception as error:
            row['ast_error'] = f'{type(error).__name__}: {error}'[:200]
        try:
            traced = trace_module(load_module(a.upstream / graph / 'model.py').GraphModule())
            eliminate_dead_code(traced.graph)
            row['fx'] = [fx_op(n) for n in expose_inplace_results(traced.graph)]
        except Exception as error:
            row['fx_error'] = f'{type(error).__name__}: {error}'[:200]
        row['agree'] = row.get('ast') == row.get('fx') if 'ast' in row and 'fx' in row else None
        if row.get('ast') or row.get('fx') or row['dunder']: affected.setdefault(index, sample)
        rows.append(row)
    print(index, flush=True) if index % 20 == 0 else None
both = [r for r in rows if 'ast' in r and 'fx' in r]
summary = {'graphs': len(rows), 'both_sides': len(both), 'agree': sum(r['agree'] for r in both),
           'with_unused_inplace': sum(bool(r['ast']) for r in both), 'with_dunder_comparison': sum(bool(r['dunder']) for r in rows),
           'affected_samples': sorted(affected)}
a.output.write_text(json.dumps({'format': 'kiln-inplace-agreement/1', 'summary': summary,
                                'disagree': [r for r in both if not r['agree']],
                                'unused_inplace': [r for r in both if r['ast']], 'dunder': [r for r in rows if r['dunder']],
                                'errors': [r for r in rows if 'ast_error' in r or 'fx_error' in r]}, indent=2) + '\n')
a.plan.write_text(json.dumps({'format': 'kiln-task-plan/1', 'band': 'KILN-009 phase 4 affected samples',
                              'tasks': [{'index': i, 'sample': s} for i, s in sorted(affected.items())]}, indent=2) + '\n')
print(json.dumps(summary))
