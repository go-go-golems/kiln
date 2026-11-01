"""Canonicalize public functional call arguments for structural matching.

Integration-protocol transformation, not part of original PassBench. Does not
rewrite tensor computations, relax predicates, or modify replacement code.
"""
import inspect
import operator
import torch

# Narrow explicit scope: functions whose inspectable Python signatures and
# defaults define the explicitly supported integration call forms.
TARGETS = {torch.nn.functional.relu, torch.nn.functional.batch_norm,
           torch.nn.functional.dropout, torch.nn.functional.interpolate,
           torch.nn.functional.softmax, torch.nn.functional.gelu,
           torch.nn.functional.layer_norm, torch.nn.functional.max_pool2d,
           torch.nn.functional.hardtanh, torch.nn.functional.pad, torch._C._nn.pad,
           # symbolic tracing drops embedding's explicit defaults; TorchDynamo records all seven
           torch.nn.functional.embedding,
           torch.nn.functional.dropout1d, torch.nn.functional.dropout2d, torch.nn.functional.dropout3d,
           torch.nn.functional.alpha_dropout, torch.nn.functional.feature_alpha_dropout,
           torch.nn.functional.normalize, torch.functional.norm, torch.nn.functional.unfold}

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
PAD_SIGNATURE = inspect.Signature([
    inspect.Parameter(name,inspect.Parameter.POSITIONAL_OR_KEYWORD,default=default)
    for name,default in [('input',inspect.Parameter.empty),('pad',inspect.Parameter.empty),
                         ('mode','constant'),('value',None)]
])


# Spelling aliases of one tensor operation. torch.nn.functional.sigmoid/tanh are Python
# wrappers around Tensor.sigmoid/tanh: symbolic tracing of a pattern records the method,
# while TorchDynamo records the functional call. Canonicalize every spelling to the
# torch function on both sides so equal computations match.
ALIASES = {'sigmoid': torch.sigmoid, 'tanh': torch.tanh}
FUNCTION_ALIASES = {torch.nn.functional.sigmoid: torch.sigmoid, torch.nn.functional.tanh: torch.tanh}


# A source that calls a comparison dunder by name (`in_0.__eq__(0)`, KILN-009 family 162): symbolic
# tracing of the pattern dispatches it through Proxy's magic method and records operator.eq,
# while TorchDynamo records call_method __eq__. Both spell one binary comparison.
DUNDER_ALIASES = {f'__{name}__': getattr(operator, name) for name in ('eq', 'ne', 'lt', 'le', 'gt', 'ge')}


def canonicalize_spellings(graph_module):
    changed = []
    for node in graph_module.graph.nodes:
        if node.op == 'call_method' and node.target in DUNDER_ALIASES and len(node.args) == 2 and not node.kwargs:
            changed.append({'node': node.name, 'spelling': 'call_method:' + node.target})
            node.op, node.target = 'call_function', DUNDER_ALIASES[node.target]
            continue
        target = (ALIASES.get(node.target) if node.op == 'call_method' and isinstance(node.target, str) else
                  FUNCTION_ALIASES.get(node.target) if node.op == 'call_function' else None)
        if target is None or len(node.args) != 1 or node.kwargs:
            continue
        changed.append({'node': node.name, 'spelling': node.op + ':' + (node.target if isinstance(node.target, str) else node.target.__module__ + '.' + node.target.__name__)})
        node.op, node.target = 'call_function', target
    return changed


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
                     PAD_SIGNATURE if node.target in (torch.nn.functional.pad,torch._C._nn.pad) else
                     inspect.signature(node.target))
        if any(p.kind not in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)
               for p in signature.parameters.values()):
            raise ValueError(f'{node.name}: unsupported signature')
        bound = signature.bind(*node.args, **node.kwargs)
        bound.apply_defaults()
        args = tuple(bound.arguments[name] for name,p in signature.parameters.items() if p.kind!=p.KEYWORD_ONLY)
        kwargs = {name:bound.arguments[name] for name,p in signature.parameters.items() if p.kind==p.KEYWORD_ONLY}
        target=torch._C._nn.pad if node.target is torch.nn.functional.pad else node.target
        pending.append((node, target, args, kwargs))
    changed = canonicalize_spellings(graph_module)
    for node, target, args, kwargs in pending:
        if node.target is not target or node.args != args or node.kwargs != kwargs:
            changed.append({'node':node.name, 'target':node.target.__module__+'.'+node.target.__name__})
            node.target,node.args,node.kwargs = target,args,kwargs
    graph_module.graph.lint()
    graph_module.recompile()
    return changed


INPLACE_OPERATORS = ('add', 'sub', 'mul', 'truediv', 'floordiv', 'mod', 'pow', 'matmul', 'and', 'or', 'xor', 'lshift', 'rshift')


def trace_pattern(pattern):
    """Trace a trusted match pattern so that it has the target identities TorchDynamo captures.

    Ordinary Proxy += falls back to add; autowrapping a directly imported operator.iadd
    (or isub, imul, itruediv, ...) retains the in-place target identity without executing or
    rewriting the operation. A directly imported operator.setitem (generate_pass binds every
    x[index] = value of a pattern to a name) is autowrapped the same way, so the write is a node
    with a result the pattern can return; TorchDynamo records the same operator.setitem target.
    Factory calls (torch.arange/zeros/ones/full/tensor/linspace,
    fx_trace.FACTORIES) are recorded as call_function nodes, as TorchDynamo captures them,
    instead of being executed into get_attr constants (which would also create CUDA tensors for
    device=cuda arguments). No target graph nodes or evaluator predicates change.
    Protocol identity: kiln-pattern-autowrap/3.
    """
    import operator
    from fx_trace import MutationTracer
    tracer = MutationTracer(autowrap_functions=tuple(getattr(operator, 'i' + name) for name in INPLACE_OPERATORS) + (operator.setitem,))
    graph = tracer.trace(pattern)
    return torch.fx.GraphModule(tracer.root, graph)
