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
           torch.nn.functional.softmax, torch.nn.functional.gelu,
           torch.nn.functional.layer_norm, torch.nn.functional.max_pool2d}

# The builtin GELU has no inspectable Python signature. Its public schema has a
# keyword-only approximation selector; keep that selector in canonical kwargs.
GELU_SIGNATURE = inspect.Signature([
    inspect.Parameter('input', inspect.Parameter.POSITIONAL_OR_KEYWORD),
    inspect.Parameter('approximate', inspect.Parameter.KEYWORD_ONLY, default='none'),
])
MAX_POOL2D_SIGNATURE = inspect.Signature([
    inspect.Parameter(name, inspect.Parameter.POSITIONAL_OR_KEYWORD, default=default)
    for name,default in [('input',inspect.Parameter.empty),('kernel_size',inspect.Parameter.empty),
                         ('stride',None),('padding',0),('dilation',1),
                         ('ceil_mode',False),('return_indices',False)]
])


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
        signature = (GELU_SIGNATURE if node.target is torch.nn.functional.gelu else
                     MAX_POOL2D_SIGNATURE if node.target is torch.nn.functional.max_pool2d else
                     inspect.signature(node.target))
        if any(p.kind not in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)
               for p in signature.parameters.values()):
            raise ValueError(f'{node.name}: unsupported signature')
        bound = signature.bind(*node.args, **node.kwargs)
        bound.apply_defaults()
        args = tuple(bound.arguments[name] for name,p in signature.parameters.items() if p.kind!=p.KEYWORD_ONLY)
        kwargs = {name:bound.arguments[name] for name,p in signature.parameters.items() if p.kind==p.KEYWORD_ONLY}
        pending.append((node, args, kwargs))
    changed = []
    for node, args, kwargs in pending:
        if node.args != args or node.kwargs != kwargs:
            changed.append({'node':node.name, 'target':node.target.__module__+'.'+node.target.__name__})
            node.args, node.kwargs = args, kwargs
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
