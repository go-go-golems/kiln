#!/usr/bin/env python3
"""CPU reproduction of family 162's matcher failure.

Extract the Kiln pattern from the jina-reranker source model exactly as generate_pass does,
then construct the upstream SubgraphMatcher with PassBench's settings. Prints the in-place
nodes without users and the matcher's verdict. With --return-inplace it appends the kept
in-place statement's result to the pattern's return tuple (the proposed fix) and retries.

usage: 01-reproduce-162-dead-code-pattern.py MODEL_PY [--return-inplace]
"""
import ast, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(ROOT / 'integrations/passnet'))
import generate_pass
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from fx_normalize import trace_pattern, normalize_arguments

source = Path(sys.argv[1]).read_text()
fix = '--return-inplace' in sys.argv[2:]
if fix:
    original = generate_pass.drop_dead_statements
    def drop_and_return(function):
        original(function)
        *body, ret = function.body
        returned = {n.id for n in ast.walk(ret) if isinstance(n, ast.Name)}
        extra = [s.targets[0].id for s in body if isinstance(s, ast.Assign) and generate_pass.inplace_call(s.value)
                 and isinstance(s.targets[0], ast.Name) and s.targets[0].id not in returned
                 and not any(isinstance(n, ast.Name) and n.id == s.targets[0].id for later in body[body.index(s)+1:] for n in ast.walk(later.value))]
        if extra:
            elts = ret.value.elts if isinstance(ret.value, ast.Tuple) else [ret.value]
            ret.value = ast.Tuple(elts=[*elts, *(ast.Name(id=e, ctx=ast.Load()) for e in extra)], ctx=ast.Load())
            print('appended in-place results to the return:', extra)
    generate_pass.drop_dead_statements = drop_and_return
pattern = generate_pass.extract_pattern(source, 2)
print(pattern.text)
namespace = {}
exec(compile(pattern.text, '<pattern>', 'exec'), namespace)
traced = trace_pattern(namespace['pattern']); normalize_arguments(traced)
dead = [n.format_node() for n in traced.graph.nodes if n.op not in ('output', 'placeholder') and not n.users and not n.is_impure()]
print('nodes without users:', dead)
print('returns (node indices):', pattern.returns)
try:
    SubgraphMatcher(traced.graph, match_output=False, match_placeholder=False, remove_overlapping_matches=True, ignore_literals=False)
    print('SubgraphMatcher: constructed')
except AssertionError as error:
    print('SubgraphMatcher:', error)
