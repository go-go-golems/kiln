"""Canonicalize public functional call arguments for structural matching.

Integration-protocol transformation, not part of original PassBench. Does not
rewrite tensor computations, relax predicates, or modify replacement code.
"""
import inspect
import torch

# Narrow explicit scope: functions whose inspectable Python signatures and
# defaults define the explicitly supported integration call forms.
TARGETS = {torch.nn.functional.relu, torch.nn.functional.batch_norm,
           torch.nn.functional.dropout, torch.nn.functional.interpolate,
           torch.nn.functional.softmax}


def normalize_arguments(graph_module):
    """Normalize whitelisted calls in place and return a change receipt.

    Bind all arguments first so an invalid call leaves the graph untouched.
    Preserve each function's ordered parameter values and fill public defaults.
    No function body executes during normalization.
    """
    pending = []
    for node in graph_module.graph.nodes:
        if node.op != 'call_function' or node.target not in TARGETS:
            continue
        signature = inspect.signature(node.target)
        if any(p.kind not in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
               for p in signature.parameters.values()):
            raise ValueError(f'{node.name}: unsupported signature')
        bound = signature.bind(*node.args, **node.kwargs)
        bound.apply_defaults()
        args = tuple(bound.arguments[name] for name in signature.parameters)
        pending.append((node, args))
    changed = []
    for node, args in pending:
        if node.args != args or node.kwargs:
            changed.append({'node':node.name, 'target':node.target.__module__+'.'+node.target.__name__})
            node.args, node.kwargs = args, {}
    graph_module.graph.lint()
    graph_module.recompile()
    return changed


def trace_pattern(pattern):
    """Preserve explicit operator.iadd calls in trusted match patterns.

    Ordinary Proxy += falls back to add; autowrapping a directly imported iadd
    retains the target identity without executing or rewriting the operation.
    No target graph nodes or evaluator predicates change.
    """
    import operator
    tracer = torch.fx.Tracer(autowrap_functions=(operator.iadd,))
    graph = tracer.trace(pattern)
    return torch.fx.GraphModule(tracer.root, graph)
