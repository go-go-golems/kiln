"""Translate kiln-fx/1 into a Kiln project script with explicit coverage errors.

Independent lowering against Kiln N APIs. No upstream implementation copied.
Every supported operation is one fx_ops.Op in REGISTRY; import_graph only walks the graph,
looks operations up and applies the shared postconditions.
"""
import json
from fx_ops import DTYPES, Call, Lowered, Op, Registry, bind
from fx_pooling import AVG_POOL2D, lower_avg_pool2d, ADAPTIVE_AVG_POOL2D, lower_adaptive_avg_pool2d
from fx_indexing import lower_index,lower_transpose,lower_reshape,lower_singleton_view,SINGLETON_FUNCTIONS,SINGLETON_METHODS,lower_flatten,FLATTEN_FUNCTIONS
from fx_linalg import FUNCTIONS as LINALG_FUNCTIONS, METHODS as LINALG_METHODS, lower_linalg
from fx_norm_ops import LAYER_NORM,lower_layer_norm,SOFTMAX,lower_softmax
from fx_max_pooling import MAX_POOL2D,lower_max_pool2d
from fx_layout import PAD,ROLL,PARTITION,PARTITION_METHODS,STACK,UNBIND,UNBIND_METHODS,lower_pad,lower_roll,lower_partition,lower_stack,lower_unbind
from fx_scalar_ops import FUNCTIONS as SCALAR_FUNCTIONS,METHODS as SCALAR_METHODS,lower_scalar

REGISTRY = Registry()


def op(name, *, functions=(), methods=(), fresh=True):
    def register(lower):
        REGISTRY.register(Op(name, lower, frozenset(functions), frozenset(methods), fresh))
        return lower
    return register


def helper(name, lower, *, functions=(), methods=(), fresh=True, target=None):
    """Register an fx_* module lowering with the (target,args,kwargs,meta,resolve,literal) shape."""
    REGISTRY.register(Op(name, lambda c: Lowered(lower(target(c) if target else c.target, c.args, c.kwargs, c.meta, c.ctx.resolve, c.ctx.literal)),
                         frozenset(functions), frozenset(methods), fresh))


def first_ref(c):
    """The FX node name of the first positional argument, when it is a direct reference."""
    first = c.raw_args['tuple'][0] if c.raw_args['tuple'] else None
    return first.get('ref') if isinstance(first, dict) else None


# ------------------------------------------------------------------------------ in-place arithmetic
@op('inplace_binary', functions=('_operator.iadd', '_operator.isub', '_operator.imul', '_operator.itruediv'))
def lower_inplace_binary(c):
    fn = {'_operator.iadd': 'add', '_operator.isub': 'sub', '_operator.imul': 'mul', '_operator.itruediv': 'div'}[c.target]
    ref = first_ref(c) if len(c.args) == 2 else None
    if len(c.args) != 2 or c.kwargs or ref is None or c.ctx.metadata[ref] != c.meta:
        raise ValueError(f'{c.name}: unsupported in-place arithmetic arguments')
    return Lowered(f'N.{fn}({c.args[0]}, {c.args[1]})', c.ctx.require_mutation_source(ref, c.name))


@op('inplace_method', methods=('add_', 'sub_', 'mul_', 'div_'), fresh=False)
def lower_inplace_method(c):
    source = first_ref(c) if c.args else None
    if len(c.args) != 2 or c.kwargs or c.ctx.metadata[source] != c.meta:
        raise ValueError(f'{c.name}: unsupported in-place arithmetic arguments')
    return Lowered(f'N.{c.target[:-1]}({c.args[0]}, {c.args[1]})', c.ctx.require_mutation_source(source, c.name))


@op('relu_method', methods=('relu_',), fresh=False)
def lower_relu_method(c):
    source = first_ref(c) if c.args else None
    if len(c.args) != 1 or c.kwargs or c.ctx.metadata[source] != c.meta:
        raise ValueError(f'{c.name}: unsupported in-place relu arguments')
    return Lowered(f'N.relu({c.args[0]})', c.ctx.require_mutation_source(source, c.name))


# ------------------------------------------------------------------------------ helper-module operations
helper('linalg', lambda kind, args, kwargs, meta, resolve, literal: lower_linalg(kind, args, kwargs, meta, resolve),
       functions=LINALG_FUNCTIONS, methods=LINALG_METHODS,
       target=lambda c: LINALG_FUNCTIONS[c.target] if c.kind == 'call_function' else c.target)
helper('adaptive_avg_pool2d', lower_adaptive_avg_pool2d, functions=ADAPTIVE_AVG_POOL2D)
helper('avg_pool2d', lower_avg_pool2d, functions=AVG_POOL2D)
helper('max_pool2d', lower_max_pool2d, functions=MAX_POOL2D)
helper('pad', lower_pad, functions=PAD)
helper('roll', lower_roll, functions=ROLL, methods=('roll',))
helper('partition', lower_partition, functions=PARTITION, methods=PARTITION_METHODS, fresh=False)
helper('stack', lower_stack, functions=STACK)
helper('unbind', lower_unbind, functions=UNBIND, methods=UNBIND_METHODS, fresh=False)
helper('softmax', lower_softmax, functions=SOFTMAX, methods=('softmax',),
       target=lambda c: 'torch.softmax' if c.kind == 'call_method' else c.target)
helper('layer_norm', lower_layer_norm, functions=LAYER_NORM)
helper('singleton_view', lower_singleton_view, functions=SINGLETON_FUNCTIONS, methods=SINGLETON_METHODS, fresh=False)
helper('flatten', lower_flatten, functions=FLATTEN_FUNCTIONS, methods=('flatten',), fresh=False)


@op('scalar', functions=SCALAR_FUNCTIONS, methods=SCALAR_METHODS)
def lower_scalar_op(c):
    expr, source_value, mutates = lower_scalar(c.target, c.kind, c.args, c.kwargs, c.meta, c.ctx.resolve, c.ctx.literal)
    source = c.ctx.source_of(source_value)
    return Lowered(expr, c.ctx.require_mutation_source(source, c.name) if mutates else None)


# ------------------------------------------------------------------------------ activations
ACTIVATIONS = {'torch.sigmoid': 'sigmoid', 'torch.nn.functional.sigmoid': 'sigmoid', 'aten.sigmoid.default': 'sigmoid',
               'torch.nn.functional.silu': 'silu', 'aten.silu.default': 'silu', 'torch._C._nn.gelu': 'gelu',
               'torch.nn.functional.gelu': 'gelu', 'aten.gelu.default': 'gelu'}


@op('activation', functions=ACTIVATIONS, methods=('sigmoid',))
def lower_activation(c):
    activation = 'sigmoid' if c.kind == 'call_method' else ACTIVATIONS[c.target]
    first = 'self' if c.target.startswith('aten.') else 'input'
    fields = [first, 'approximate'] if activation == 'gelu' else [first, 'inplace'] if activation == 'silu' else [first]
    bound = bind(c.name, activation, c.args, c.kwargs, fields, require_first=False)
    value = bound.get(first)
    source = c.ctx.source_of(value)
    inplace = bound.get('inplace', 'false')
    if inplace not in ('false', 'true'): raise ValueError(f'{c.name}: static Boolean inplace flag required')
    mutates = c.ctx.require_mutation_source(source, c.name) if inplace == 'true' else None
    metadata = c.ctx.metadata
    if source is None or not isinstance(metadata[source], dict) or metadata[source]['dtype'] != c.meta['dtype'] or metadata[source]['shape'] != c.meta['shape']:
        raise ValueError(f'{c.name}: {activation} requires a dtype-preserving floating tensor')
    # PyTorch pointwise activation arithmetic uses opmath FP32 for low
    # precision inputs. Narrow once at this source operation boundary.
    dtype = DTYPES[c.meta['dtype']]
    option = ''
    if activation == 'gelu':
        approximate = c.ctx.literal(bound.get('approximate', '"none"'))
        if approximate not in ('none', 'tanh'): raise ValueError(f'{c.name}: gelu approximate must be none or tanh')
        option = ', ' + json.dumps(approximate)
    return Lowered(f'N.cast(N.{activation}(N.cast({value}, "f32"){option}), {json.dumps(dtype)})', mutates)


UNARY = {'torch.relu': 'relu', 'torch.nn.functional.relu': 'relu', 'aten.relu.default': 'relu', 'torch.relu_': 'relu',
         'torch.exp': 'exp', 'aten.exp.default': 'exp', 'torch.sqrt': 'sqrt',
         'torch.rsqrt': 'rsqrt', 'aten.rsqrt.default': 'rsqrt', 'torch.tanh': 'tanh', 'aten.tanh.default': 'tanh'}


@op('unary', functions=UNARY)
def lower_unary(c):
    kwargs, mutates = c.kwargs, None
    if c.target == 'torch.relu_' or kwargs.get('inplace') == 'true':
        ref = first_ref(c)
        if c.target not in ('torch.nn.functional.relu', 'torch.relu_') or c.ctx.metadata[ref] != c.meta:
            raise ValueError(f'{c.name}: unsupported in-place relu arguments')
        mutates = c.ctx.require_mutation_source(ref, c.name)
        kwargs = {k: v for k, v in kwargs.items() if k != 'inplace'}
    if len(c.args) != 1 or any(k != 'inplace' or v != 'false' for k, v in kwargs.items()):
        raise ValueError(f'{c.name}: unsupported unary arguments')
    return Lowered(f'N.{UNARY[c.target]}({c.args[0]})', mutates)


BINARY = {'_operator.add': 'add', 'torch.add': 'add', 'aten.add.Tensor': 'add',
          '_operator.mul': 'mul', 'torch.mul': 'mul', 'aten.mul.Tensor': 'mul',
          '_operator.sub': 'sub', '_operator.truediv': 'div'}


@op('binary', functions=BINARY)
def lower_binary(c):
    if len(c.args) != 2 or c.kwargs:
        raise ValueError(f'{c.name}: unsupported binary arguments')
    return Lowered(f'N.{BINARY[c.target]}({c.args[0]}, {c.args[1]})')


# ------------------------------------------------------------------------------ structure and layout
@op('cat', functions=('torch.cat', 'torch.concat', 'torch.concatenate', 'aten.cat.default'))
def lower_cat(c):
    bound = bind(c.name, 'concatenation', c.args, c.kwargs, ['tensors', 'dim'], require_first=False)
    tensors = bound.get('tensors')
    if not isinstance(tensors, (tuple, list)) or not tensors or any(c.ctx.source_of(v) is None for v in tensors):
        raise ValueError(f'{c.name}: static nonempty tensor sequence required')
    axis = c.ctx.literal(bound.get('dim', '0'))
    if type(axis) is not int: raise ValueError(f'{c.name}: static concatenation dimension required')
    dtype = DTYPES[c.meta['dtype']]
    casted = [value if c.ctx.metadata[c.ctx.source_of(value)]['dtype'] == c.meta['dtype'] else f'N.cast({value}, {json.dumps(dtype)})' for value in tensors]
    return Lowered(f'N.concat([{", ".join(casted)}], {axis})')


@op('getitem', functions=('_operator.getitem',), fresh=False)
def lower_getitem(c):
    if len(c.args) != 2 or c.kwargs: raise ValueError(f'{c.name}: invalid indexing arguments')
    source = first_ref(c)
    metadata = c.ctx.metadata
    if source not in metadata: raise ValueError(f'{c.name}: indexing source required')
    if isinstance(metadata[source], (list, tuple)):
        index = c.ctx.literal(c.args[1])
        if type(index) is not int or not -len(metadata[source]) <= index < len(metadata[source]):
            raise ValueError(f'{c.name}: partition index out of range')
        item = index % len(metadata[source])
        if c.meta != metadata[source][item]: raise ValueError(f'{c.name}: partition result metadata mismatch')
        return Lowered(c.ctx.values[source][item])
    if not isinstance(metadata[source], dict): raise ValueError(f'{c.name}: basic tensor indexing requires tensor source')
    def index_literal(value):
        if isinstance(value, tuple): return tuple(index_literal(x) for x in value)
        if isinstance(value, slice) or value is Ellipsis: return value
        return c.ctx.literal(value)
    return Lowered(lower_index(c.args[0], index_literal(c.args[1]), metadata[source]['shape'], c.meta['shape']))


@op('reduction', functions=('torch.sum', 'torch.mean', 'aten.sum.dim_IntList', 'aten.mean.dim'), methods=('sum', 'mean'))
def lower_reduction(c):
    bound = bind(c.name, 'reduction', c.args, c.kwargs, ['input', 'dim', 'keepdim'], require_first=False)
    if set(c.kwargs) - {'dim', 'keepdim'}: raise ValueError(f'{c.name}: unsupported reduction arguments')
    shape = c.ctx.metadata[first_ref(c)]['shape']; rank = len(shape)
    dims = c.ctx.literal(bound.get('dim', 'null'))
    dims = list(range(rank)) if dims is None or dims == [] else [dims] if isinstance(dims, int) else dims
    if not isinstance(dims, list) or any(type(d) is not int or d < -rank or d >= rank for d in dims):
        raise ValueError(f'{c.name}: invalid reduction axes')
    axes = [d + rank if d < 0 else d for d in dims]
    if len(set(axes)) != len(axes): raise ValueError(f'{c.name}: duplicate reduction axes')
    keep = c.ctx.literal(bound.get('keepdim', 'false'))
    if type(keep) is not bool: raise ValueError(f'{c.name}: keepdim must be Boolean')
    expr = f'N.cast({bound["input"]}, "f32")'
    for axis in sorted(axes): expr = f'N.sum({expr}, {axis}, true)'
    if 'mean' in c.target:
        count = 1
        for axis in axes: count *= shape[axis]
        expr = f'N.mul({expr}, {1 / count!r})'
    if not keep:
        expr = f'N.reshape({expr}, {json.dumps([dim for axis, dim in enumerate(shape) if axis not in axes])})'
    return Lowered(f'N.cast({expr}, {json.dumps(DTYPES[c.meta["dtype"]])})')


@op('transpose', functions=('torch.transpose', 'aten.transpose.int'), methods=('transpose',), fresh=False)
def lower_transpose_op(c):
    input_name = 'self' if c.target == 'aten.transpose.int' else 'input'
    bound = bind(c.name, 'transpose', c.args, c.kwargs, [input_name, 'dim0', 'dim1'], require_first=False)
    if set(bound) != {input_name, 'dim0', 'dim1'}: raise ValueError(f'{c.name}: transpose requires input and two dimensions')
    source = c.ctx.source_of(bound[input_name])
    if source is None: raise ValueError(f'{c.name}: transpose input must reference a tensor')
    return Lowered(lower_transpose(bound[input_name], c.ctx.literal(bound['dim0']), c.ctx.literal(bound['dim1']), c.ctx.metadata[source], c.meta))


def static_sizes(c, args):
    """Sizes given either as one sequence argument or as varargs."""
    return c.ctx.literal(args[0]) if len(args) == 1 and isinstance(args[0], (tuple, list)) else [c.ctx.literal(x) for x in args]


@op('reshape', functions=('torch.reshape', 'aten.reshape.default'), methods=('reshape', 'view'), fresh=False)
def lower_reshape_op(c):
    if c.kind == 'call_method':
        if not c.args or c.kwargs: raise ValueError(f'{c.name}: unsupported layout arguments')
        value = c.args[0]; shape = static_sizes(c, c.args[1:])
    else:
        first = 'self' if c.target == 'aten.reshape.default' else 'input'
        bound = bind(c.name, 'reshape', c.args, c.kwargs, [first, 'shape'], require_first=False)
        if set(bound) != {first, 'shape'}: raise ValueError(f'{c.name}: reshape input and shape required')
        value = bound[first]; shape = c.ctx.literal(bound['shape'])
    source = c.ctx.source_of(value)
    if source is None or not isinstance(c.ctx.metadata[source], dict): raise ValueError(f'{c.name}: reshape operand must reference a tensor')
    return Lowered(lower_reshape(value, shape, c.ctx.metadata[source], c.meta))


@op('expand', methods=('expand',), fresh=False)
def lower_expand(c):
    if not c.args or c.kwargs: raise ValueError(f'{c.name}: unsupported expand arguments')
    requested = static_sizes(c, c.args[1:])
    source = c.ctx.resolve(c.args[0]); original = source['shape']
    if not isinstance(requested, list) or len(requested) < len(original) or any(type(d) is not int for d in requested):
        raise ValueError(f'{c.name}: static expand dimensions required')
    offset = len(requested) - len(original); shape = []
    for axis, size in enumerate(requested):
        prior = 1 if axis < offset else original[axis - offset]
        if size == -1 and axis >= offset: size = prior
        if size <= 0 or (prior != 1 and size != prior): raise ValueError(f'{c.name}: invalid expand dimension')
        shape.append(size)
    if c.meta['shape'] != shape or c.meta['dtype'] != source['dtype']:
        raise ValueError(f'{c.name}: expand output metadata mismatch')
    return Lowered(f'N.expand({c.args[0]}, {json.dumps(requested)})')


@op('expand_as', methods=('expand_as',), fresh=False)
def lower_expand_as(c):
    if len(c.args) != 2 or c.kwargs: raise ValueError(f'{c.name}: expand_as requires self and other tensor')
    source = c.ctx.resolve(c.args[0]); requested = c.ctx.resolve(c.args[1])['shape']
    offset = len(requested) - len(source['shape'])
    if offset < 0 or any(a != 1 and a != b for a, b in zip(source['shape'], requested[offset:])):
        raise ValueError(f'{c.name}: invalid expand_as shape')
    if c.meta['shape'] != requested or c.meta['dtype'] != source['dtype']:
        raise ValueError(f'{c.name}: expand_as output metadata mismatch')
    return Lowered(f'N.expand({c.args[0]}, {json.dumps(requested)})')


@op('unfold', methods=('unfold',), fresh=False)
def lower_unfold(c):
    if len(c.args) != 4 or c.kwargs: raise ValueError(f'{c.name}: unfold requires dimension, size and step')
    source = c.ctx.resolve(c.args[0]); shape = source['shape']; rank = len(shape)
    axis, size, step = (c.ctx.literal(v) for v in c.args[1:])
    if any(type(v) is not int for v in (axis, size, step)) or not -rank <= axis < rank or size <= 0 or step <= 0:
        raise ValueError(f'{c.name}: static unfold parameters required')
    axis %= rank
    if size > shape[axis]: raise ValueError(f'{c.name}: unfold window exceeds input')
    expected = shape.copy(); expected[axis] = (shape[axis] - size) // step + 1; expected.append(size)
    if c.meta['shape'] != expected or c.meta['dtype'] != source['dtype']:
        raise ValueError(f'{c.name}: unfold output metadata mismatch')
    return Lowered(f'N.unfold({c.args[0]}, {axis}, {size}, {step})')


@op('contiguous', methods=('contiguous',), fresh=False)
def lower_contiguous(c):
    if len(c.args) != 1 or c.kwargs: raise ValueError(f'{c.name}: unsupported contiguous format')
    return Lowered(f'N.reshape({c.args[0]}, {json.dumps(c.meta["shape"])})')


@op('permute', methods=('permute',), fresh=False)
def lower_permute(c):
    if c.kwargs: raise ValueError(f'{c.name}: unsupported permutation keywords')
    dims = static_sizes(c, c.args[1:])
    rank = len(c.ctx.metadata[first_ref(c)]['shape'])
    if len(dims) != rank or any(type(d) is not int for d in dims):
        raise ValueError(f'{c.name}: permutation must specify every axis')
    dims = [d + rank if d < 0 else d for d in dims]
    if sorted(dims) != list(range(rank)): raise ValueError(f'{c.name}: invalid permutation')
    current = list(range(rank)); expr = c.args[0]
    for axis, wanted in enumerate(dims):
        other = current.index(wanted)
        if other != axis:
            expr = f'N.transpose({expr}, {axis}, {other})'
            current[axis], current[other] = current[other], current[axis]
    return Lowered(expr)


# ------------------------------------------------------------------------------ dtype and device conversion
@op('type_as', methods=('type_as',), fresh=False)
def lower_type_as(c):
    if len(c.args) != 2 or c.kwargs: raise ValueError(f'{c.name}: type_as requires self and tensor')
    source = c.ctx.resolve(c.args[0]); other = c.ctx.resolve(c.args[1])
    if c.meta['shape'] != source['shape'] or c.meta['dtype'] != other['dtype'] or other['dtype'] not in DTYPES:
        raise ValueError(f'{c.name}: type_as result metadata mismatch')
    return Lowered(f'N.cast({c.args[0]}, {json.dumps(DTYPES[other["dtype"]])})')


@op('to', methods=('to',), fresh=False)
def lower_to(c):
    if len(c.args) == 2 and not c.kwargs and c.args[1] in ('"cuda"', '"cuda:0"'):
        source = c.ctx.source_of(c.args[0])
        if source is None or c.ctx.metadata[source] != c.meta:
            raise ValueError(f'{c.name}: device-only conversion must preserve tensor metadata')
        return Lowered(c.args[0])
    if len(c.args) > 2 or set(c.kwargs) - {'dtype'}: raise ValueError(f'{c.name}: device/layout conversion unsupported')
    if (len(c.args) == 2) == ('dtype' in c.kwargs):
        raise ValueError(f'{c.name}: exactly one explicit dtype required')
    dtype = c.ctx.literal(c.args[1] if len(c.args) == 2 else c.kwargs['dtype'])
    if dtype not in DTYPES: raise ValueError(f'{c.name}: unsupported cast dtype {dtype}')
    return Lowered(f'N.cast({c.args[0]}, {json.dumps(DTYPES[dtype])})')


@op('float_conversion', methods=('float', 'half', 'bfloat16'), fresh=False)
def lower_float_conversion(c):
    if len(c.args) != 1 or c.kwargs: raise ValueError(f'{c.name}: invalid floating conversion')
    return Lowered(f'N.cast({c.args[0]}, {json.dumps({"float": "f32", "half": "f16", "bfloat16": "bf16"}[c.target])})')


# ------------------------------------------------------------------------------ neural-network operations
@op('conv2d', functions=('torch.conv2d',))
def lower_conv2d(c):
    bound = bind(c.name, 'conv2d', c.args, c.kwargs, ['input', 'weight', 'bias', 'stride', 'padding', 'dilation', 'groups'], require_first=False)
    options = {key: c.ctx.literal(bound.get(key, default)) for key, default in [('stride', '1'), ('padding', '0'), ('dilation', '1'), ('groups', '1')]}
    return Lowered(f'N.conv2d({bound["input"]}, {bound["weight"]}, {bound.get("bias", "null")}, {json.dumps(options)})')


@op('interpolate', functions=('torch.nn.functional.interpolate',))
def lower_interpolate(c):
    kwargs = c.kwargs
    if c.meta.get('dtype') not in DTYPES or len(c.args) != 1:
        raise ValueError(f'{c.name}: interpolation requires supported floating dtype and explicit keyword options')
    if set(kwargs) - {'size', 'scale_factor', 'mode', 'align_corners', 'recompute_scale_factor', 'antialias'}:
        raise ValueError(f'{c.name}: unsupported interpolation arguments')
    if kwargs.get('mode') != '"bilinear"' or kwargs.get('align_corners') != 'false' or kwargs.get('scale_factor', 'null') != 'null' or kwargs.get('antialias', 'false') != 'false' or kwargs.get('recompute_scale_factor', 'null') not in ('null', 'false'):
        raise ValueError(f'{c.name}: only explicit-size bilinear align_corners=False supported')
    return Lowered(f'N.resizeBilinear({c.args[0]}, {json.dumps(c.ctx.literal(kwargs["size"]))})')


@op('batch_norm', functions=('torch.nn.functional.batch_norm',))
def lower_batch_norm(c):
    # Public PyTorch functional signature: input, mean, var, weight, bias,
    # training=False, momentum=0.1, eps=1e-5. Inference only.
    bound = bind(c.name, 'batch_norm', c.args, c.kwargs, ['input', 'running_mean', 'running_var', 'weight', 'bias', 'training', 'momentum', 'eps'], require_first=False)
    if bound.get('training', 'false') != 'false':
        raise ValueError(f'{c.name}: training batch_norm requires statistics updates')
    source = first_ref(c)
    if source is None: raise ValueError(f'{c.name}: batch_norm input must reference a tensor')
    shape = c.ctx.metadata[source]['shape']
    if len(shape) < 2: raise ValueError(f'{c.name}: batch_norm requires a channel dimension')
    channels = [1, shape[1]] + [1] * (len(shape) - 2)
    def channel(field, optional=False):
        value = bound.get(field, 'null')
        if value == 'null':
            if optional: return None
            raise ValueError(f'{c.name}: inference batch_norm requires {field}')
        source_id = c.ctx.source_of(value)
        if source_id is None or c.ctx.metadata[source_id]['shape'] != [shape[1]]:
            raise ValueError(f'{c.name}: invalid channel vector {field}')
        return f'N.reshape(N.cast({value}, "f32"), {json.dumps(channels)})'
    mean, variance = channel('running_mean'), channel('running_var')
    weight, bias = channel('weight', True), channel('bias', True)
    eps = bound.get('eps', '1e-5')
    epsilon = json.loads(eps)
    if not isinstance(epsilon, (int, float)) or epsilon < 0: raise ValueError(f'{c.name}: invalid epsilon')
    expr = f'N.div(N.sub(N.cast({bound["input"]}, "f32"), {mean}), N.sqrt(N.add({variance}, {eps})))'
    if weight: expr = f'N.mul({expr}, {weight})'
    if bias: expr = f'N.add({expr}, {bias})'
    return Lowered(f'N.cast({expr}, {json.dumps(DTYPES[c.meta["dtype"]])})')


@op('dropout', functions=('torch.nn.functional.dropout',), fresh=False)
def lower_dropout(c):
    bound = dict(zip(['input', 'p', 'training', 'inplace'], c.args)); bound.update(c.kwargs)
    if bound.get('training', 'true') != 'false' or bound.get('inplace', 'false') != 'false':
        raise ValueError(f'{c.name}: only disabled non-inplace dropout supported')
    return Lowered(bound['input'])


# ------------------------------------------------------------------------------ the graph walk
class Context:
    def __init__(self, graph):
        self.metadata = {n['id']: n.get('tensor_meta') for n in graph['nodes']}
        self.values = {}          # FX node name -> Kiln variable (or list of variables)
        self.by_var = {}          # Kiln variable -> FX node name
        self.inputs = {}          # placeholder FX node name -> input index
        self.fresh = set()        # FX values with fresh storage; exclusive use is checked at mutation
        self.uses = {}
        def references(value):
            if isinstance(value, dict):
                if set(value) == {'ref'}: self.uses[value['ref']] = self.uses.get(value['ref'], 0) + 1
                else:
                    for item in value.values(): references(item)
            elif isinstance(value, list):
                for item in value: references(item)
        for node in graph['nodes']:
            references(node['args']); references(node['kwargs'])

    def bind_value(self, name, value):
        self.values[name] = value
        if isinstance(value, str): self.by_var.setdefault(value, name)

    @staticmethod
    def literal(value):
        if isinstance(value, (tuple, list)): return [Context.literal(x) for x in value]
        return json.loads(value)

    def decode(self, v):
        if isinstance(v, dict):
            if set(v) == {'ellipsis'} and v['ellipsis'] is True: return Ellipsis
            if set(v) == {'slice'}: return slice(*(self.literal(self.decode(x)) for x in v['slice']))
            if set(v) == {'dtype'}: return json.dumps(v['dtype'])
            if set(v) == {'device'}:
                if v['device'] not in ('cuda', 'cuda:0'): raise ValueError(f'Unsupported device conversion: {v["device"]}')
                return json.dumps(v['device'])
            if set(v) == {'ref'}:
                if v['ref'] not in self.values: raise ValueError(f'Unknown or forward reference: {v["ref"]}')
                return self.values[v['ref']]
            if set(v) in ({'tuple'}, {'list'}):
                items = [self.decode(x) for x in next(iter(v.values()))]
                return tuple(items) if 'tuple' in v else items
            if set(v) == {'dict'}: return {k: self.decode(x) for k, x in v['dict'].items()}
            raise ValueError(f'Unsupported encoded value: {v}')
        if v is None or isinstance(v, (str, int, float, bool)): return json.dumps(v)
        raise ValueError(f'Invalid argument: {v}')

    def source_of(self, value):
        return self.by_var.get(value) if isinstance(value, str) else None

    def resolve(self, value):
        source = self.source_of(value)
        if source is None or not isinstance(self.metadata[source], dict): raise ValueError('operand must reference a tensor')
        return self.metadata[source]

    def require_mutation_source(self, source, name):
        if source is None or self.uses.get(source) != 1 or (source not in self.fresh and source not in self.inputs):
            raise ValueError(f'{name}: in-place operation requires fresh single-use producer or single-use input')
        return source


def import_graph(graph):
    if graph.get('format') != 'kiln-fx/1':
        raise ValueError('Expected kiln-fx/1')
    ctx = Context(graph)
    specs, input_dtypes, lines, outputs = {}, {}, [], None
    input_mutations, output_alias_values = {}, {}
    for i, node in enumerate(graph['nodes']):
        name = node['id']
        if name in ctx.values: raise ValueError(f'Duplicate node: {name}')
        var = f'v{i}'
        meta = node.get('tensor_meta')
        if node['kind'] == 'placeholder':
            if not isinstance(meta, dict) or meta.get('dtype') not in DTYPES:
                raise ValueError(f'{name}: only supported floating tensor inputs accepted')
            shape = meta['shape']
            if any(type(d) is not int or d <= 0 for d in shape): raise ValueError(f'{name}: positive static dimensions required')
            expected, size = [], 1
            for d in reversed(shape): expected.insert(0, size); size *= d
            if meta['strides'] != expected: raise ValueError(f'{name}: noncontiguous input requires layout lowering')
            specs[var] = shape; input_dtypes[var] = DTYPES[meta['dtype']]
            ctx.bind_value(name, var); ctx.inputs[name] = len(ctx.inputs)
            continue
        args, kwargs = ctx.decode(node['args']), ctx.decode(node['kwargs'])
        if node['kind'] == 'output':
            outputs = args[0]
            continue
        if node['kind'] not in ('call_function', 'call_method'):
            raise ValueError(f'{name}: unsupported node kind {node["kind"]}')
        target = node['target']
        spec = REGISTRY.lookup(node['kind'], target)
        if spec is None:
            if node['kind'] == 'call_method': raise ValueError(f'{name}: unsupported tensor method {target}')
            raise ValueError(f'{name}: unsupported target {target}; implement semantic lowering')
        lowered = spec.lower(Call(name, node['kind'], target, args, kwargs, node['args'], meta, ctx))
        expr = lowered.expr
        if isinstance(expr, list):
            ctx.bind_value(name, [f'{var}_{j}' for j in range(len(expr))])
            lines.extend(f'const {var}_{j} = {item};' for j, item in enumerate(expr))
            continue
        if not isinstance(meta, dict) or meta.get('dtype') not in DTYPES:
            raise ValueError(f'{name}: supported floating result metadata required')
        lines.append(f'const {var} = {expr};')
        ctx.bind_value(name, var)
        if lowered.mutates in ctx.inputs:
            index = ctx.inputs[lowered.mutates]
            input_mutations[index] = var
            output_alias_values[var] = index
        # Views, casts and disabled dropout may alias: their Op declares fresh=False, so they
        # never transfer ownership. Accepted in-place calls only consume an already owned value
        # whose sole use is this operation.
        elif spec.fresh:
            ctx.fresh.add(name)
    if outputs is None: raise ValueError('Missing graph output')
    flat = []
    def flatten(v):
        if isinstance(v, (list, tuple)): return {'tuple' if isinstance(v, tuple) else 'list': [flatten(x) for x in v]}
        if isinstance(v, dict): return {'dict': {k: flatten(x) for k, x in v.items()}}
        if v not in ctx.values.values(): raise ValueError('Only tensor node outputs supported')
        if v in output_alias_values: return {'input_alias': output_alias_values[v]}
        key = f'out{len(flat)}'; flat.append((key, v)); return {'output': key}
    structure = flatten(outputs)
    mutations = [{'input_index': index, 'output': f'__mut{index}'} for index in sorted(input_mutations)]
    result = ', '.join([*(f'{key}: {v}' for key, v in flat), *(f'__mut{index}: {input_mutations[index]}' for index in sorted(input_mutations))])
    inputs = ', '.join(f'{key}: k.tensor({json.dumps(shape)}, {json.dumps(input_dtypes[key])})' for key, shape in specs.items())
    script = 'project("passnet").program(({' + ', '.join(specs) + '}) => {\n'
    script += '\n'.join(lines) + '\nreturn {' + result + '};\n}, {' + inputs + '});\n'
    return {'script': script, 'inputs': specs, 'input_dtypes': input_dtypes, 'output_structure': structure, 'input_mutations': mutations}
