"""Translate kiln-fx/1 into a Kiln project script with explicit coverage errors.

Independent lowering against Kiln N APIs. No upstream implementation copied.
Every supported operation is one fx_ops.Op in REGISTRY; import_graph only walks the graph,
looks operations up and applies the shared postconditions.
"""
import json
from dtypes import FLOATING, IMPORTED
from fx_ops import Call, Lowered, Op, Registry, bind, fill_literal
from fx_pooling import AVG_POOL2D, lower_avg_pool2d, ADAPTIVE_AVG_POOL2D, lower_adaptive_avg_pool2d
from fx_indexing import lower_index,lower_transpose,lower_reshape,lower_singleton_view,SINGLETON_FUNCTIONS,SINGLETON_METHODS,lower_flatten,FLATTEN_FUNCTIONS
from fx_linalg import FUNCTIONS as LINALG_FUNCTIONS, METHODS as LINALG_METHODS, lower_linalg
from fx_norm_ops import LAYER_NORM,lower_layer_norm,SOFTMAX,lower_softmax
from fx_max_pooling import MAX_POOL2D,lower_max_pool2d
from fx_layout import PAD,ROLL,PARTITION,PARTITION_METHODS,STACK,UNBIND,UNBIND_METHODS,lower_pad,lower_roll,lower_partition,lower_stack,lower_unbind
from fx_scalar_ops import FUNCTIONS as SCALAR_FUNCTIONS,METHODS as SCALAR_METHODS,lower_scalar
import fx_compose
import fx_assign
import fx_coverage
from fx_indexing import lower_index as _lower_index

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


def js_int(value):
    """A Python int as an exact N.int literal: past 2^53 a JS number rounds, so it is spelled as a BigInt."""
    return f'N.int({value}n)' if abs(value) > 2 ** 53 - 1 else f'N.int({value})'


def operand(c, j, value=None):
    """Positional argument j as a Kiln operand. A Python int or bool scalar is spelled N.int/N.bool:
    PyTorch promotion gives it the integer or bool category, which a bare JS number (float) loses.
    A 0-d CUDA tensor beside a dimensioned float16/bfloat16 operand is converted to that dtype first
    (cuda_scalar_operand)."""
    raw = c.raw_args['tuple'][j] if value is None else value
    text = c.args[j] if value is None else json.dumps(value)
    if type(raw) is bool: return f'N.bool({json.dumps(raw)})'
    if type(raw) is int: return js_int(raw)
    return cuda_scalar_operand(c, j, text) if value is None else text


LOW_PRECISION = ('torch.float16', 'torch.bfloat16')


def cuda_scalar_operand(c, j, text):
    """Operand j of a binary elementwise op, converted as CUDA PyTorch converts it.

    The dimensioned operand's dtype is the common dtype; a 0-d tensor operand does not promote it. On
    CUDA, TensorIterator then converts a 0-d *CUDA* tensor operand to the common dtype before the
    arithmetic (x_bf16 / torch.tensor(0.05, device='cuda') divides by bf16(0.05) = 0.050048828125),
    while a CPU 0-d tensor or a Python number enters the opmath (float32) computation unrounded.
    Kiln's elementwise semantics are the latter, so a 0-d CUDA operand is narrowed explicitly here.
    Measured on GB10 (integration Step 14, probe-zero-dim.py) for add/sub/mul/div, reversed and in place."""
    raw = c.raw_args['tuple']
    if len(raw) != 2: return text
    this, other = raw[j], raw[1 - j]
    if not (isinstance(this, dict) and 'ref' in this and isinstance(other, dict) and 'ref' in other): return text
    mine, theirs = c.ctx.metadata.get(this['ref']), c.ctx.metadata.get(other['ref'])
    if not (isinstance(mine, dict) and isinstance(theirs, dict)): return text
    if mine['shape'] != [] or theirs['shape'] == [] or theirs['dtype'] not in LOW_PRECISION or mine['dtype'] == theirs['dtype']: return text
    if c.ctx.devices.get(this['ref']) != 'cuda': return text
    return f'N.cast({text}, {json.dumps(IMPORTED[theirs["dtype"]])})'


# ------------------------------------------------------------------------------ in-place arithmetic
INPLACE_BINARY = {'_operator.iadd': 'add', '_operator.isub': 'sub', '_operator.imul': 'mul', '_operator.itruediv': 'div',
                  '_operator.ifloordiv': 'floordiv', '_operator.imod': 'remainder'}


@op('inplace_binary', functions=INPLACE_BINARY)
def lower_inplace_binary(c):
    fn = INPLACE_BINARY[c.target]
    ref = first_ref(c) if len(c.args) == 2 else None
    if len(c.args) != 2 or c.kwargs or ref is None or c.ctx.metadata[ref] != c.meta:
        raise ValueError(f'{c.name}: unsupported in-place arithmetic arguments')
    if ref in c.ctx.views: return Lowered(f'N.{fn}({c.args[0]}, {operand(c, 1)})', view_write=ref)
    return Lowered(f'N.{fn}({c.args[0]}, {operand(c, 1)})', c.ctx.require_mutation_source(ref, c.name))


@op('inplace_method', methods=('add_', 'sub_', 'mul_', 'div_'), fresh=False)
def lower_inplace_method(c):
    source = first_ref(c) if c.args else None
    if len(c.args) != 2 or c.kwargs or c.ctx.metadata[source] != c.meta:
        raise ValueError(f'{c.name}: unsupported in-place arithmetic arguments')
    if source in c.ctx.views: return Lowered(f'N.{c.target[:-1]}({c.args[0]}, {operand(c, 1)})', view_write=source)
    return Lowered(f'N.{c.target[:-1]}({c.args[0]}, {operand(c, 1)})', c.ctx.require_mutation_source(source, c.name))


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


for _name, _lower, _functions, _methods in [
        ('norm', fx_compose.lower_norm, ('torch.functional.norm', 'torch.norm'), ('norm',)),
        ('normalize', fx_compose.lower_normalize, ('torch.nn.functional.normalize',), ()),
        ('prelu', fx_compose.lower_prelu, ('torch.prelu', 'torch.nn.functional.prelu'), ()),
        ('einsum', fx_compose.lower_einsum, ('torch.functional.einsum', 'torch.einsum'), ()),
        ('im2col', fx_compose.lower_im2col, ('torch.nn.functional.unfold',), ()),
        ('attention', fx_compose.lower_sdpa, ('torch._C._nn.scaled_dot_product_attention', 'torch.nn.functional.scaled_dot_product_attention'), ())]:
    op(_name, functions=_functions, methods=_methods)(lambda c, _lower=_lower: Lowered(_lower(c)))


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
    dtype = floating_dtype(c, activation)
    option = ''
    if activation == 'gelu':
        approximate = c.ctx.literal(bound.get('approximate', '"none"'))
        if approximate not in ('none', 'tanh'): raise ValueError(f'{c.name}: gelu approximate must be none or tanh')
        option = ', ' + json.dumps(approximate)
    return Lowered(f'N.cast(N.{activation}(N.cast({value}, "f32"){option}), {json.dumps(dtype)})', mutates)


UNARY = {'torch.relu': 'relu', 'torch.nn.functional.relu': 'relu', 'aten.relu.default': 'relu', 'torch.relu_': 'relu', '_operator.neg': 'neg',
         'torch.exp': 'exp', 'aten.exp.default': 'exp', 'torch.sqrt': 'sqrt',
         'torch.rsqrt': 'rsqrt', 'aten.rsqrt.default': 'rsqrt', 'torch.tanh': 'tanh', 'aten.tanh.default': 'tanh',
         'torch.floor': 'floor',
         'torch.abs': 'abs', 'aten.abs.default': 'abs', 'torch.log': 'log', 'aten.log.default': 'log'}


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


BINARY_METHODS = {'add': 'add', 'sub': 'sub', 'mul': 'mul'}


@op('binary', functions=BINARY, methods=BINARY_METHODS)
def lower_binary(c):
    if len(c.args) != 2 or c.kwargs:
        raise ValueError(f'{c.name}: unsupported binary arguments')
    fn = (BINARY_METHODS if c.kind == 'call_method' else BINARY)[c.target]
    if fn in ('mul', 'add') and isinstance(c.meta, dict) and c.meta.get('dtype') == 'torch.bool':
        # bool * bool is logical and, bool + bool logical or (PyTorch keeps bool): exact over i32 0/1
        return Lowered(f'N.cast(N.{fn}(N.cast({operand(c, 0)}, "i32"), N.cast({operand(c, 1)}, "i32")), "bool")')
    return Lowered(f'N.{fn}({operand(c, 0)}, {operand(c, 1)})')


# Division with a rounding rule. a // b, floor_divide and div(rounding_mode="floor") round toward
# negative infinity; a % b and remainder take the divisor's sign; fmod and div(rounding_mode="trunc")
# round toward zero. Kiln lowers these over int32, int64 and float32 results (float16 and bfloat16
# would round each intermediate step); true division (div without a mode) is float division.
DIVISION_FUNCTIONS = {'_operator.floordiv': 'floordiv', 'torch.floor_divide': 'floordiv', '_operator.mod': 'remainder',
                      'torch.remainder': 'remainder', 'torch.fmod': 'fmod', 'torch.div': 'div'}
DIVISION_METHODS = {'floor_divide': 'floordiv', '__floordiv__': 'floordiv', 'remainder': 'remainder', '__mod__': 'remainder',
                    'fmod': 'fmod', 'div': 'div'}
ROUNDED_DIVISION_RESULTS = ('torch.int32', 'torch.int64', 'torch.float32')


@op('division', functions=DIVISION_FUNCTIONS, methods=DIVISION_METHODS)
def lower_division(c):
    fn = (DIVISION_METHODS if c.kind == 'call_method' else DIVISION_FUNCTIONS)[c.target]
    if len(c.args) != 2 or set(c.kwargs) - ({'rounding_mode'} if fn == 'div' else set()):
        raise ValueError(f'{c.name}: unsupported {fn} arguments')
    mode = c.ctx.literal(c.kwargs.get('rounding_mode', 'null'))
    if mode not in (None, 'floor', 'trunc'): raise ValueError(f'{c.name}: unsupported div rounding_mode {mode!r}')
    if not isinstance(c.meta, dict): raise ValueError(f'{c.name}: {fn} of non-tensor values is not lowered')
    if (fn != 'div' or mode is not None) and c.meta['dtype'] not in ROUNDED_DIVISION_RESULTS:
        raise ValueError(f'{c.name}: {fn if fn != "div" else "div rounding_mode=" + mode} over {c.meta["dtype"]} is not lowered (int32, int64 and float32 only)')
    args = f'{operand(c, 0)}, {operand(c, 1)}'
    return Lowered(f'N.{fn}({args})' if mode is None else f'N.div({args}, {json.dumps(mode)})')


@op('neg_method', methods=('neg',))
def lower_neg_method(c):
    if len(c.args) != 1 or c.kwargs: raise ValueError(f'{c.name}: unsupported neg arguments')
    return Lowered(f'N.neg({c.args[0]})')


# ------------------------------------------------------------------------------ comparisons and masks
COMPARISONS = ('eq', 'ne', 'lt', 'le', 'gt', 'ge')
COMPARE_FUNCTIONS = {f'{prefix}{n}': n for n in COMPARISONS for prefix in ('_operator.', 'torch.')}
COMPARE_METHODS = {**{n: n for n in COMPARISONS}, **{f'__{n}__': n for n in COMPARISONS}}


@op('compare', functions=COMPARE_FUNCTIONS, methods=COMPARE_METHODS)
def lower_compare(c):
    if len(c.args) != 2 or c.kwargs: raise ValueError(f'{c.name}: unsupported comparison arguments')
    fn = (COMPARE_METHODS if c.kind == 'call_method' else COMPARE_FUNCTIONS)[c.target]
    return Lowered(f'N.{fn}({operand(c, 0)}, {operand(c, 1)})')


def lower_masked_fill(c):
    bound = bind(c.name, 'masked_fill', c.args, c.kwargs, ['input', 'mask', 'value'], require_first=False)
    if c.ctx.resolve(bound['mask'])['dtype'] != 'torch.bool': raise ValueError(f'{c.name}: masked_fill requires a bool mask')
    value = bound['value']
    if c.ctx.source_of(value) is not None: raise ValueError(f'{c.name}: a tensor fill value is not supported')
    expr = f'N.maskedFill({bound["input"]}, {bound["mask"]}, {operand(c, None, c.ctx.literal(value))})'
    return Lowered(expr, c.ctx.require_mutation_source(first_ref(c), c.name) if c.target == 'masked_fill_' else None)


op('masked_fill', functions=('torch.masked_fill',), methods=('masked_fill',))(lower_masked_fill)
op('masked_fill_', methods=('masked_fill_',), fresh=False)(lower_masked_fill)


def lower_cumulative(name, values_and_indices=False):
    """cumsum/cumprod (with no dtype argument) and the values of cummax/cummin: inclusive scans along a
    static dimension. cummax/cummin return (values, indices); the indices are not lowered and refuse
    only where used, as for max/min over a dimension."""
    def lower(c):
        params = ['input', 'dim'] if values_and_indices else ['input', 'dim', 'dtype']
        bound = bind(c.name, name, c.args, c.kwargs, params, require_first=False)
        if c.ctx.literal(bound.get('dtype', 'null')) is not None: raise ValueError(f'{c.name}: {name} dtype argument unsupported')
        dim = c.ctx.literal(bound['dim'])
        if type(dim) is not int: raise ValueError(f'{c.name}: static dimension required')
        expr = f'N.{name}({bound["input"]}, {dim})'
        return Lowered([expr, None] if values_and_indices else expr)
    return lower


for _name in ('cumsum', 'cumprod'): op(_name, functions=(f'torch.{_name}',), methods=(_name,))(lower_cumulative(_name))
for _name in ('cummax', 'cummin'): op(_name, functions=(f'torch.{_name}',), methods=(_name,))(lower_cumulative(_name, values_and_indices=True))


@op('max_min', functions=('torch.max', 'torch.min'), methods=('max', 'min'))
def lower_max_min(c):
    """max/min over a dimension is (values, indices); the indices are N.argmax/N.argmin (first NaN, else
    first extreme). Over two tensors it is elementwise; with neither, a full reduction."""
    fn = c.target.rsplit('.', 1)[-1]
    bound = bind(c.name, fn, c.args, c.kwargs, ['input', 'dim', 'keepdim'], require_first=False)
    x, dim = bound['input'], bound.get('dim')
    if dim is not None and c.ctx.source_of(dim) is not None:
        if 'keepdim' in bound: raise ValueError(f'{c.name}: elementwise {fn} takes two tensors')
        return Lowered(f'N.{fn}({x}, {dim})')
    reduce = 'amax' if fn == 'max' else 'amin'
    source = c.ctx.resolve(x); shape = source['shape']
    # floating reductions compute in f32; max/min select a value, so narrowing back is exact
    narrow = (lambda e: f'N.cast({e}, {json.dumps(FLOATING[source["dtype"]])})') if source['dtype'] in FLOATING else (lambda e: e)
    if dim is None:
        if c.kwargs: raise ValueError(f'{c.name}: unsupported {fn} arguments')
        expr = x
        for axis in range(len(shape)): expr = f'N.{reduce}({expr}, {axis}, true)'
        return Lowered(narrow(f'N.reshape({expr}, [])'))
    dim, keep = c.ctx.literal(dim), c.ctx.literal(bound.get('keepdim', 'false'))
    if type(dim) is not int or type(keep) is not bool: raise ValueError(f'{c.name}: static dim and keepdim required')
    return Lowered([narrow(f'N.{reduce}({x}, {dim}, {json.dumps(keep)})'), f'N.arg{fn}({x}, {dim}, {json.dumps(keep)})'])


@op('argmax', functions=('torch.argmax', 'torch.argmin'), methods=('argmax', 'argmin'))
def lower_argmax(c):
    """argmax/argmin along a dimension; without one, over the flattened tensor (keepdim: all-ones shape)."""
    fn = c.target.rsplit('.', 1)[-1]
    bound = bind(c.name, fn, c.args, c.kwargs, ['input', 'dim', 'keepdim'], require_first=False)
    x, shape = bound['input'], c.ctx.resolve(bound['input'])['shape']
    dim, keep = c.ctx.literal(bound.get('dim', 'null')), c.ctx.literal(bound.get('keepdim', 'false'))
    if type(keep) is not bool or not (dim is None or type(dim) is int): raise ValueError(f'{c.name}: static dim and keepdim required')
    if dim is not None: return Lowered(f'N.{fn}({x}, {dim}, {json.dumps(keep)})')
    size = 1
    for d in shape: size *= d
    flat = f'N.{fn}(N.reshape({x}, [{size}]), 0, true)'
    return Lowered(f'N.reshape({flat}, {json.dumps([1] * len(shape) if keep else [])})')


# ------------------------------------------------------------------------------ factories (KILN-010)
def factory_dtype(c, what):
    dtype = c.meta.get('dtype') if isinstance(c.meta, dict) else None
    if dtype not in IMPORTED: raise ValueError(f'{c.name}: {what} result dtype {dtype} unsupported')
    return IMPORTED[dtype]


def factory_device(c, bound):
    device = bound.get('device', 'null')
    if device not in ('null', '"cuda"', '"cuda:0"', '"cpu"'): raise ValueError(f'{c.name}: unsupported factory device')
    if c.ctx.literal(bound.get('requires_grad', 'false')) is not False or c.ctx.literal(bound.get('pin_memory', 'false')) is not False:
        raise ValueError(f'{c.name}: factory requires_grad/pin_memory unsupported')
    if bound.get('layout', 'null') not in ('null', '"torch.strided"'): raise ValueError(f'{c.name}: factory layout unsupported')


FACTORY_KEYWORDS = ['dtype', 'layout', 'device', 'pin_memory', 'requires_grad', 'out', 'memory_format']


@op('arange', functions=('torch.arange',))
def lower_arange(c):
    """torch.arange with integer arguments (one, two or three); the dtype is the recorded result's."""
    positional = [c.ctx.literal(a) for a in c.args]
    if not 1 <= len(positional) <= 3 or set(c.kwargs) - {'start', 'end', 'step', *FACTORY_KEYWORDS}:
        raise ValueError(f'{c.name}: unsupported arange arguments')
    if 'out' in c.kwargs: raise ValueError(f'{c.name}: arange out= unsupported')
    factory_device(c, c.kwargs)
    start, end, step = (0, positional[0], 1) if len(positional) == 1 else (*positional, 1)[:3]
    if any(type(v) is not int for v in (start, end, step)) or step == 0:
        raise ValueError(f'{c.name}: arange requires integer start, end and nonzero step (float arange not lowered)')
    return Lowered(f'N.arange({start}, {end}, {step}, {json.dumps(factory_dtype(c, "arange"))})')


@op('fill_factory', functions=('torch.zeros', 'torch.ones', 'torch.full'))
def lower_fill_factory(c):
    """zeros/ones/full: a typed splat of the recorded shape and dtype."""
    kind = c.target.rsplit('.', 1)[-1]
    value = 0 if kind == 'zeros' else 1
    if kind == 'full':
        bound = bind(c.name, 'full', c.args, c.kwargs, ['size', 'fill_value', *FACTORY_KEYWORDS], require_first=False)
        value = c.ctx.literal(bound.get('fill_value', 'null'))
    else:
        bound = {k: v for k, v in c.kwargs.items()}
        if set(bound) - {'size', *FACTORY_KEYWORDS}: raise ValueError(f'{c.name}: unsupported {kind} arguments')
    factory_device(c, bound)
    if type(value) not in (int, float, bool): raise ValueError(f'{c.name}: static fill value required')
    return Lowered(f'N.full({json.dumps(c.meta["shape"])}, {fill_literal(c, value)}, {json.dumps(factory_dtype(c, kind))})')


LIKE = {'torch.zeros_like': 0, 'torch.ones_like': 1, 'torch.full_like': None}
NEW = {'new_zeros': 0, 'new_ones': 1, 'new_full': None, 'new_empty': None}


@op('fill_like', functions=tuple(LIKE), methods=('new_zeros', 'new_ones', 'new_full'))
def lower_fill_like(c):
    """zeros_like/full_like(x, v) and x.new_zeros(size)/new_full(size, v): a typed splat of the
    recorded result's shape and dtype (the tensor argument contributes only metadata)."""
    if c.kind == 'call_method':
        name = c.target
        fields = ['self', 'size', 'fill_value'] if name == 'new_full' else ['self', 'size']
        value = NEW[name]
    else:
        name = c.target.rsplit('.', 1)[-1]
        fields = ['input', 'fill_value'] if name == 'full_like' else ['input']
        value = LIKE[c.target]
    bound = bind(c.name, name, c.args, c.kwargs, [*fields, *FACTORY_KEYWORDS], require_first=False)
    factory_device(c, bound)
    if 'fill_value' in fields: value = c.ctx.literal(bound.get('fill_value', 'null'))
    if type(value) not in (int, float, bool): raise ValueError(f'{c.name}: static fill value required')
    return Lowered(f'N.full({json.dumps(c.meta["shape"])}, {fill_literal(c, value)}, {json.dumps(factory_dtype(c, name))})')


@op('tensor_literal', functions=('torch.tensor',))
def lower_tensor_literal(c):
    """torch.tensor(number, dtype=, device=): a 0-d typed constant of the recorded dtype (PyTorch infers
    f32 for a Python float, i64 for an int, bool for a bool). Nested data lists are not lowered."""
    bound = bind(c.name, 'tensor', c.args, c.kwargs, ['data', 'dtype', 'device', 'requires_grad', 'pin_memory'], require_first=True)
    factory_device(c, bound)
    value = c.ctx.literal(bound['data'])
    if type(value) not in (int, float, bool): raise ValueError(f'{c.name}: torch.tensor of a static number required (data lists are not lowered)')
    return Lowered(f'N.full([], {fill_literal(c, value)}, {json.dumps(factory_dtype(c, "tensor"))})')


@op('linspace', functions=('torch.linspace',))
def lower_linspace(c):
    """torch.linspace(start, end, steps): with step = (end - start) / (steps - 1), element i is
    start + step * i in the first half (i < steps // 2) and end - step * (steps - 1 - i) in the second,
    PyTorch's symmetric formula, in the result's dtype (f32 here) with the step rounded once."""
    bound = bind(c.name, 'linspace', c.args, c.kwargs, ['start', 'end', 'steps', 'out', *[k for k in FACTORY_KEYWORDS if k != 'out']], require_first=True)
    factory_device(c, bound)
    start, end, steps = (c.ctx.literal(bound.get(k, 'null')) for k in ('start', 'end', 'steps'))
    if any(type(v) not in (int, float) for v in (start, end)) or type(steps) is not int or steps < 1 or 'out' in bound:
        raise ValueError(f'{c.name}: linspace requires static numeric start/end and integer steps')
    if factory_dtype(c, 'linspace') != 'f32': raise ValueError(f'{c.name}: only float32 linspace is lowered')
    if steps == 1: return Lowered(f'N.full([1], {json.dumps(float(start))}, "f32")')
    import struct
    f32 = lambda v: struct.unpack('f', struct.pack('f', v))[0]
    step = f32(f32(f32(end) - f32(start)) / (steps - 1))  # float arithmetic, as PyTorch's float kernel
    i = f'N.cast(N.arange(0, {steps}, 1, "i64"), "f32")'
    low = f'N.add(N.mul({i}, {json.dumps(step)}), {json.dumps(float(start))})'
    high = f'N.sub({json.dumps(float(end))}, N.mul(N.sub({json.dumps(float(steps - 1))}, {i}), {json.dumps(step)}))'
    half = f'N.lt(N.arange(0, {steps}, 1, "i64"), N.int({steps // 2}))'
    return Lowered(f'N.select({half}, {low}, {high})')


@op('meshgrid', functions=('torch.functional.meshgrid', 'torch.meshgrid'), fresh=False)
def lower_meshgrid(c):
    """meshgrid of 1-D tensors: tensor k broadcast along its own axis of the full grid. indexing='xy'
    exchanges the first two axes. The results are views of the inputs."""
    if set(c.kwargs) - {'indexing'}: raise ValueError(f'{c.name}: unsupported meshgrid arguments')
    tensors = list(c.args[0]) if len(c.args) == 1 and isinstance(c.args[0], (list, tuple)) else list(c.args)
    indexing = c.ctx.literal(c.kwargs.get('indexing', '"ij"'))
    if indexing not in ('ij', 'xy') or not tensors or any(c.ctx.source_of(t) is None for t in tensors):
        raise ValueError(f'{c.name}: meshgrid of tensors with indexing ij or xy required')
    sizes = []
    for t in tensors:
        shape = c.ctx.resolve(t)['shape']
        if len(shape) > 1: raise ValueError(f'{c.name}: meshgrid inputs must be 0-d or 1-d')
        sizes.append(shape[0] if shape else 1)
    axis = list(range(len(tensors)))
    if indexing == 'xy' and len(tensors) >= 2: axis[0], axis[1] = 1, 0
    full = [0] * len(tensors)
    for k, a in enumerate(axis): full[a] = sizes[k]
    out = []
    for k, t in enumerate(tensors):
        shape = [1] * len(tensors); shape[axis[k]] = sizes[k]
        out.append(f'N.expand(N.reshape({t}, {json.dumps(shape)}), {json.dumps(full)})')
    return Lowered(out)


@op('repeat', methods=('repeat',), fresh=True)
def lower_repeat(c):
    repeats = static_sizes(c, c.args[1:])
    if c.kwargs or not isinstance(repeats, list) or any(type(r) is not int or r < 1 for r in repeats):
        raise ValueError(f'{c.name}: static positive repeats required')
    return Lowered(f'N.repeat({c.args[0]}, {json.dumps(repeats)})')


@op('repeat_interleave', functions=('torch.repeat_interleave',), methods=('repeat_interleave',), fresh=True)
def lower_repeat_interleave(c):
    bound = bind(c.name, 'repeat_interleave', c.args, c.kwargs, ['input', 'repeats', 'dim', 'output_size'], require_first=False)
    repeats, dim = c.ctx.literal(bound.get('repeats', 'null')), c.ctx.literal(bound.get('dim', 'null'))
    if type(repeats) is not int or repeats < 1 or type(dim) is not int or bound.get('output_size', 'null') != 'null':
        raise ValueError(f'{c.name}: static integer repeats and dim required')
    return Lowered(f'N.repeatInterleave({bound["input"]}, {repeats}, {dim})')


@op('where', functions=('torch.where',))
def lower_where(c):
    if len(c.args) != 3 or c.kwargs: raise ValueError(f'{c.name}: where(condition, input, other) required')
    if c.ctx.resolve(c.args[0])['dtype'] != 'torch.bool': raise ValueError(f'{c.name}: where requires a bool condition')
    return Lowered(f'N.select({c.args[0]}, {operand(c, 1)}, {operand(c, 2)})')


# ------------------------------------------------------------------------------ structure and layout
@op('cat', functions=('torch.cat', 'torch.concat', 'torch.concatenate', 'aten.cat.default'))
def lower_cat(c):
    bound = bind(c.name, 'concatenation', c.args, c.kwargs, ['tensors', 'dim'], require_first=False)
    tensors = bound.get('tensors')
    if not isinstance(tensors, (tuple, list)) or not tensors or any(c.ctx.source_of(v) is None for v in tensors):
        raise ValueError(f'{c.name}: static nonempty tensor sequence required')
    axis = c.ctx.literal(bound.get('dim', '0'))
    if type(axis) is not int: raise ValueError(f'{c.name}: static concatenation dimension required')
    dtype = IMPORTED[c.meta['dtype']]
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
        if c.ctx.values[source][item] is None: raise ValueError(f'{c.name}: result {item} of {source} (cummax/cummin indices) is not lowered')
        return Lowered(c.ctx.values[source][item])
    if not isinstance(metadata[source], dict): raise ValueError(f'{c.name}: basic tensor indexing requires tensor source')
    gather = tensor_index(c, c.args[1])
    if gather: return gather
    key = index_literal(c.ctx, c.name, c.args[1])
    lowered = Lowered(lower_index(c.args[0], key, metadata[source]['shape'], c.meta['shape']))
    c.ctx.record_view(c.name, source, key)
    return lowered


def index_literal(ctx, name, value):
    """A decoded basic index as Python values (ints, slices, None, Ellipsis); tensors are refused."""
    if isinstance(value, tuple): return tuple(index_literal(ctx, name, x) for x in value)
    if isinstance(value, slice) or value is Ellipsis: return value
    if isinstance(value, str) and ctx.source_of(value) is not None:
        raise ValueError(f'{name}: a tensor index mixed with other indices is not supported')
    return ctx.literal(value)


def tensor_index(c, index):
    """x[ids] and x[:, …, ids]: one int64 tensor after full slices is a gather with Python's negative
    index wrapping. Boolean masks have data-dependent shapes and are refused."""
    entries = index if isinstance(index, tuple) else (index,)
    refs = [j for j, x in enumerate(entries) if isinstance(x, str) and c.ctx.source_of(x) is not None]
    if not refs: return None
    axis = refs[0]
    if len(refs) != 1 or any(x != slice(None) for x in entries[:axis]) or entries[axis + 1:]:
        raise ValueError(f'{c.name}: only one tensor index after full slices is supported')
    ids = c.ctx.resolve(entries[axis])
    if ids['dtype'] != 'torch.int64': raise ValueError(f'{c.name}: {ids["dtype"]} tensor index unsupported (int64 gathers only)')
    return Lowered(f'N.gather({c.args[0]}, {entries[axis]}, {axis}, true)')


@op('embedding', functions=('torch.nn.functional.embedding',))
def lower_embedding(c):
    bound = bind(c.name, 'embedding', c.args, c.kwargs, ['input', 'weight', 'padding_idx', 'max_norm', 'norm_type', 'scale_grad_by_freq', 'sparse'])
    # padding_idx, scale_grad_by_freq and sparse affect gradients only; max_norm renormalizes the weight in place
    if c.ctx.literal(bound.get('max_norm', 'null')) is not None: raise ValueError(f'{c.name}: embedding max_norm mutates the weight')
    if c.ctx.resolve(bound['input'])['dtype'] != 'torch.int64': raise ValueError(f'{c.name}: int64 embedding indices required')
    return Lowered(f'N.embedding({bound["input"]}, {bound["weight"]})')


@op('index_select', functions=('torch.index_select',), methods=('index_select',))
def lower_index_select(c):
    bound = bind(c.name, 'index_select', c.args, c.kwargs, ['input', 'dim', 'index'])
    index = c.ctx.resolve(bound['index'])
    if index['dtype'] != 'torch.int64' or len(index['shape']) != 1: raise ValueError(f'{c.name}: one-dimensional int64 index required')
    dim = c.ctx.literal(bound['dim'])
    if type(dim) is not int: raise ValueError(f'{c.name}: static dimension required')
    return Lowered(f'N.indexSelect({bound["input"]}, {dim}, {bound["index"]})')


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
    # an integer or bool sum is exact in int64 (Kiln widens integer sums, as PyTorch does)
    integer = 'sum' in c.target and isinstance(c.meta, dict) and c.meta.get('dtype') == 'torch.int64'
    expr = bound["input"] if integer else f'N.cast({bound["input"]}, "f32")'
    for axis in sorted(axes): expr = f'N.sum({expr}, {axis}, true)'
    if 'mean' in c.target:
        count = 1
        for axis in axes: count *= shape[axis]
        expr = f'N.mul({expr}, {1 / count!r})'
    if not keep:
        expr = f'N.reshape({expr}, {json.dumps([dim for axis, dim in enumerate(shape) if axis not in axes])})'
    return Lowered(expr if integer else f'N.cast({expr}, {json.dumps(floating_dtype(c, "reduction"))})')


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


@op('detach', methods=('detach',), fresh=False)
def lower_detach(c):
    if len(c.args) != 1 or c.kwargs: raise ValueError(f'{c.name}: invalid detach')
    return Lowered(c.args[0])


@op('t', methods=('t',), fresh=False)
def lower_t(c):
    if len(c.args) != 1 or c.kwargs or len(c.ctx.resolve(c.args[0])['shape']) > 2: raise ValueError(f'{c.name}: t() requires a tensor of rank at most 2')
    return Lowered(f'N.transpose({c.args[0]}, 0, -1)' if len(c.ctx.resolve(c.args[0])['shape']) == 2 else c.args[0])


@op('contiguous', methods=('contiguous',), fresh=False)
def lower_contiguous(c):
    """contiguous() of a strided (non row-major) tensor is a copy with fresh storage; of a row-major
    one it is the tensor itself (an alias)."""
    if len(c.args) != 1 or c.kwargs: raise ValueError(f'{c.name}: unsupported contiguous format')
    source = c.ctx.resolve(c.args[0])
    return Lowered(f'N.reshape({c.args[0]}, {json.dumps(c.meta["shape"])})', fresh=source.get('strides') != row_major(source['shape']))


def row_major(shape):
    strides, size = [], 1
    for d in reversed(shape): strides.insert(0, size); size *= d
    return strides


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
    if c.meta['shape'] != source['shape'] or c.meta['dtype'] != other['dtype'] or other['dtype'] not in IMPORTED:
        raise ValueError(f'{c.name}: type_as result metadata mismatch')
    return Lowered(f'N.cast({c.args[0]}, {json.dumps(IMPORTED[other["dtype"]])})', fresh=True if source['dtype'] != other['dtype'] else None)


DEVICES = ('"cuda"', '"cuda:0"', '"cpu"')


@op('to', methods=('to',), fresh=False)
def lower_to(c):
    """x.to(device?, dtype?, non_blocking=, copy=): one device holds every Kiln value, so a device
    move is shape and dtype only. A dtype change is a cast with fresh storage; copy=True copies;
    otherwise the result is the source (an alias, or a contiguous copy whose strides differ)."""
    if c.kwargs.get('memory_format', 'null') not in ('null', '"torch.preserve_format"'):
        raise ValueError(f'{c.name}: to memory_format unsupported')
    positional = list(c.args[1:])
    device = c.kwargs.get('device', 'null'); dtype = c.kwargs.get('dtype', 'null')
    if positional and positional[0] in DEVICES: device = positional.pop(0)
    elif positional and positional[0] in ('null',): positional.pop(0)
    if positional and positional[0].startswith('"torch.'): dtype = positional.pop(0)
    if positional or set(c.kwargs) - {'device', 'dtype', 'non_blocking', 'copy', 'memory_format'} or device not in ('null', *DEVICES):
        raise ValueError(f'{c.name}: device/layout conversion unsupported')
    copy = c.ctx.literal(c.kwargs.get('copy', 'false')); blocking = c.ctx.literal(c.kwargs.get('non_blocking', 'false'))
    if type(copy) is not bool or type(blocking) is not bool: raise ValueError(f'{c.name}: static copy/non_blocking flags required')
    source = c.ctx.source_of(c.args[0])
    if source is None or not isinstance(c.ctx.metadata[source], dict): raise ValueError(f'{c.name}: to requires a tensor')
    smeta = c.ctx.metadata[source]
    if dtype == 'null':
        if device == 'null': raise ValueError(f'{c.name}: to requires an explicit dtype or device')
        same = lambda m: {k: v for k, v in m.items() if k != 'strides'}
        if same(smeta) != same(c.meta): raise ValueError(f'{c.name}: device-only conversion must preserve shape and dtype')
        return Lowered(c.args[0], fresh=True if copy else None)
    dtype = c.ctx.literal(dtype)
    if dtype not in IMPORTED: raise ValueError(f'{c.name}: unsupported cast dtype {dtype}')
    return Lowered(f'N.cast({c.args[0]}, {json.dumps(IMPORTED[dtype])})', fresh=True if copy or dtype != smeta['dtype'] else None)


def floating_dtype(c, what):
    """The Kiln dtype of a floating operation's result; integer values are refused by name."""
    dtype = c.meta.get('dtype') if isinstance(c.meta, dict) else None
    if dtype not in FLOATING: raise ValueError(f'{c.name}: {what} requires a floating tensor, got {dtype}')
    return FLOATING[dtype]


@op('device_method', methods=('cuda', 'cpu'), fresh=False)
def lower_device_method(c):
    """x.cuda() / x.cpu(): a device move, shape and dtype only (one device holds every Kiln value)."""
    if len(c.args) != 1 or set(c.kwargs) - {'non_blocking', 'device', 'memory_format'} or c.kwargs.get('memory_format', 'null') not in ('null', '"torch.preserve_format"'):
        raise ValueError(f'{c.name}: unsupported {c.target} arguments')
    return Lowered(c.args[0])


# Kiln decides legality: a cast to the value's own dtype is the value
CONVERSION_METHODS = {'float': 'f32', 'half': 'f16', 'bfloat16': 'bf16', 'long': 'i64', 'int': 'i32', 'bool': 'bool'}


@op('dtype_conversion', methods=tuple(CONVERSION_METHODS), fresh=False)
def lower_dtype_conversion(c):
    if len(c.args) != 1 or c.kwargs: raise ValueError(f'{c.name}: invalid dtype conversion')
    # a conversion to another dtype allocates (fresh storage an in-place call may update); to its own dtype it is the value
    changes = IMPORTED.get(c.ctx.resolve(c.args[0])['dtype']) != CONVERSION_METHODS[c.target]
    return Lowered(f'N.cast({c.args[0]}, {json.dumps(CONVERSION_METHODS[c.target])})', fresh=True if changes else None)


# ------------------------------------------------------------------------------ neural-network operations
@op('conv2d', functions=('torch.conv2d',))
def lower_conv2d(c):
    bound = bind(c.name, 'conv2d', c.args, c.kwargs, ['input', 'weight', 'bias', 'stride', 'padding', 'dilation', 'groups'], require_first=False)
    options = {key: c.ctx.literal(bound.get(key, default)) for key, default in [('stride', '1'), ('padding', '0'), ('dilation', '1'), ('groups', '1')]}
    return Lowered(f'N.conv2d({bound["input"]}, {bound["weight"]}, {bound.get("bias", "null")}, {json.dumps(options)})')


@op('conv1d', functions=('torch.conv1d', 'torch.nn.functional.conv1d'))
def lower_conv1d(c):
    """A 1-d convolution is a 2-d one over a unit height axis."""
    bound = bind(c.name, 'conv1d', c.args, c.kwargs, ['input', 'weight', 'bias', 'stride', 'padding', 'dilation', 'groups'], require_first=False)
    one = lambda v: v[0] if isinstance(v, list) and len(v) == 1 else v
    options = {key: one(c.ctx.literal(bound.get(key, default))) for key, default in [('stride', '1'), ('padding', '0'), ('dilation', '1'), ('groups', '1')]}
    if any(type(options[k]) is not int for k in options): raise ValueError(f'{c.name}: static integer conv1d options required')
    options2 = {'stride': [1, options['stride']], 'padding': [0, options['padding']], 'dilation': [1, options['dilation']], 'groups': options['groups']}
    x, w = c.ctx.resolve(bound['input']), c.ctx.resolve(bound['weight'])
    if len(x['shape']) != 3 or len(w['shape']) != 3: raise ValueError(f'{c.name}: batched 3-d input and weight required')
    x4 = f'N.reshape({bound["input"]}, {json.dumps([x["shape"][0], x["shape"][1], 1, x["shape"][2]])})'
    w4 = f'N.reshape({bound["weight"]}, {json.dumps([w["shape"][0], w["shape"][1], 1, w["shape"][2]])})'
    return Lowered(f'N.reshape(N.conv2d({x4}, {w4}, {bound.get("bias", "null")}, {json.dumps(options2)}), {json.dumps(c.meta["shape"])})')


@op('interpolate', functions=('torch.nn.functional.interpolate',))
def lower_interpolate(c):
    kwargs = c.kwargs
    if c.meta.get('dtype') not in FLOATING or len(c.args) != 1:
        raise ValueError(f'{c.name}: interpolation requires supported floating dtype and explicit keyword options')
    if set(kwargs) - {'size', 'scale_factor', 'mode', 'align_corners', 'recompute_scale_factor', 'antialias'}:
        raise ValueError(f'{c.name}: unsupported interpolation arguments')
    explicit = kwargs.get('scale_factor', 'null') == 'null' and kwargs.get('antialias', 'false') == 'false' and kwargs.get('recompute_scale_factor', 'null') in ('null', 'false') and 'size' in kwargs
    size = c.ctx.literal(kwargs['size']) if 'size' in kwargs else None
    if explicit and kwargs.get('mode') == '"nearest"' and kwargs.get('align_corners', 'null') == 'null':
        return Lowered(f'N.resizeNearest({c.args[0]}, {json.dumps(size)})')
    source = c.ctx.resolve(c.args[0])
    same = isinstance(size, list) and source['shape'][2:] == size or type(size) is int and all(d == size for d in source['shape'][2:])
    if explicit and same and kwargs.get('mode') in ('"bilinear"', '"bicubic"', '"linear"', '"trilinear"') and kwargs.get('align_corners', 'null') in ('null', 'false'):
        # resampling to the input's own size with half-pixel centers reads source coordinate i at output i:
        # every interpolation weight is 0 except the centre tap's 1, so the result is the input (finite inputs)
        return Lowered(f'N.reshape({c.args[0]}, {json.dumps(c.meta["shape"])})')
    if not explicit or kwargs.get('mode') != '"bilinear"' or kwargs.get('align_corners') != 'false':
        raise ValueError(f'{c.name}: only explicit-size nearest and bilinear align_corners=False supported')
    return Lowered(f'N.resizeBilinear({c.args[0]}, {json.dumps(size)})')


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
    return Lowered(f'N.cast({expr}, {json.dumps(floating_dtype(c, "batch_norm"))})')


DROPOUT = ('torch.nn.functional.dropout', 'torch.nn.functional.dropout1d', 'torch.nn.functional.dropout2d',
           'torch.nn.functional.dropout3d', 'torch.nn.functional.alpha_dropout', 'torch.nn.functional.feature_alpha_dropout')


@op('dropout', functions=DROPOUT, fresh=False)
def lower_dropout(c):
    """Dropout with training=False is the identity, in place or not."""
    bound = bind(c.name, 'dropout', c.args, c.kwargs, ['input', 'p', 'training', 'inplace'])
    if c.ctx.literal(bound.get('training', 'true')) is not False or type(c.ctx.literal(bound.get('inplace', 'false'))) is not bool:
        raise ValueError(f'{c.name}: only dropout with training=False is lowered')
    return Lowered(bound['input'])


# ------------------------------------------------------------------------------ coverage wave (fx_coverage)
for _name, _lower, _functions, _methods, _fresh in [
        ('unary_method', fx_coverage.lower_unary_method, (), fx_coverage.UNARY_METHODS, True),
        ('getattr', fx_coverage.lower_getattr, ('builtins.getattr',), (), False),
        ('clone', fx_coverage.lower_clone, (), ('clone',), True),
        ('tile', fx_coverage.lower_tile, (), ('tile',), True),
        ('triu', lambda c: fx_coverage.triangle(c, True), ('torch.triu',), (), True),
        ('tril', lambda c: fx_coverage.triangle(c, False), ('torch.tril',), (), True),
        ('all_any', fx_coverage.lower_all_any, ('torch.all', 'torch.any'), (), True),
        ('invert', fx_coverage.lower_invert, ('_operator.invert',), (), True),
        ('tensor_split', fx_coverage.lower_tensor_split, ('torch.tensor_split',), ('tensor_split',), False),
        ('conv3d', fx_coverage.lower_conv3d, ('torch.conv3d', 'torch.nn.functional.conv3d'), (), True),
        ('avg_pool1d', fx_coverage.lower_avg_pool1d, ('torch.avg_pool1d', 'torch.nn.functional.avg_pool1d'), (), True),
        ('multi_head_attention', fx_coverage.lower_multi_head_attention, ('torch.nn.functional.multi_head_attention_forward',), (), True)]:
    op(_name, functions=_functions, methods=_methods, fresh=_fresh)(lambda c, _lower=_lower: Lowered(_lower(c)))


@op('fill_', methods=('fill_',), fresh=False)
def lower_fill_(c):
    """x.fill_(v): every element of x becomes v converted to x's dtype. On a recorded basic view of a fresh
    value it is slice assignment of the view's region; on a fresh value or an input an in-place update."""
    source = first_ref(c)
    if len(c.args) != 2 or c.kwargs or source is None: raise ValueError(f'{c.name}: unsupported fill_ arguments')
    if c.ctx.source_of(c.args[1]) is not None: raise ValueError(f'{c.name}: a tensor fill value is not lowered')
    expr = fx_coverage.fill_value(c, c.args[1], c.ctx.metadata[source]['dtype'])
    if source in c.ctx.views: return Lowered(expr, view_write=source)
    return Lowered(expr, c.ctx.require_mutation_source(source, c.name))


# ------------------------------------------------------------------------------ the graph walk
class Context:
    def __init__(self, graph):
        self.metadata = {n['id']: n.get('tensor_meta') for n in graph['nodes']}
        self.values = {}          # FX node name -> Kiln variable (or list of variables)
        self.by_var = {}          # Kiln variable -> FX node name
        self.inputs = {}          # placeholder FX node name -> input index
        self.fresh = set()        # FX values with fresh storage; exclusive use is checked at mutation
        self.aliased = set()      # storage roots a view, cast or partition result may share
        self.roots = {}           # FX value -> the value whose storage an in-place chain updates
        self.views = {}           # FX value -> fx_assign.View: a basic-index region of a fresh root
        self.alias_sources = {}   # FX value that may share storage (fresh=False) -> the FX values it reads
        self.uses = {}
        self.last_use = {}        # FX value -> index of the last node reading it
        self.at = 0               # index of the node being lowered
        self.devices = {}         # FX value -> 'cuda' or 'cpu', the device the source program places it on
        def references(value):
            if isinstance(value, dict):
                if set(value) == {'ref'}:
                    self.uses[value['ref']] = self.uses.get(value['ref'], 0) + 1
                    self.last_use[value['ref']] = self.at
                else:
                    for item in value.values(): references(item)
            elif isinstance(value, list):
                for item in value: references(item)
        for i, node in enumerate(graph['nodes']):
            self.at = i; references(node['args']); references(node['kwargs'])

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

    def root(self, name):
        return self.roots.get(name, name)

    def storage(self, name):
        """The storage root a value reads: a recorded view's root, else its in-place chain root."""
        return self.views[name].root if name in self.views else self.root(name)

    def record_view(self, name, source, key):
        """getitem with a basic index of a fresh root (or of a recorded view): writes through it can be
        lowered as slice assignment. Anything else is an untracked alias (the root becomes aliased)."""
        try:
            if source in self.views: view = fx_assign.compose(self.views[source], key)
            elif source in self.fresh and self.root(source) not in self.aliased:
                view = fx_assign.of(self.root(source), key, self.metadata[source]['shape'])
            else: return
        except ValueError:
            return
        self.views[name] = view

    def owns(self, name):
        """A value whose storage this program may write: fresh and not aliased by an untracked view."""
        return name in self.fresh and self.root(name) not in self.aliased

    def source_of(self, value):
        return self.by_var.get(value) if isinstance(value, str) else None

    def resolve(self, value):
        source = self.source_of(value)
        if source is None or not isinstance(self.metadata[source], dict): raise ValueError('operand must reference a tensor')
        return self.metadata[source]

    def owners(self, name):
        """The storage owners (fresh values or inputs) a value may alias; an in-place chain is its root."""
        name = self.root(name)
        if name not in self.alias_sources: return {name}
        return set().union(*(self.owners(r) for r in self.alias_sources[name]))

    def live_aliases(self, owner, chain):
        """Values outside the in-place chain rooted at `chain` that share owner's storage and are read
        after the node being lowered: they would observe an in-place update that rebinding cannot give them."""
        return [n for n in self.values if self.root(n) != chain and owner in self.owners(n) and self.last_use.get(n, -1) > self.at]

    def require_mutation_source(self, source, name):
        """An in-place call may update an input (or an in-place chain from one), recorded as an input
        mutation, or a value with fresh storage, when no alias outside the chain reads the storage later.
        Later uses of the chain's names read the updated value (rebinding); earlier uses read the old one.
        A fresh value nothing aliases yet, or an untracked view of a fresh value whose other aliases are
        dead, qualifies."""
        if source is None: raise ValueError(f'{name}: in-place operation requires a fresh unaliased producer or an input')
        chain = self.root(source)
        if chain in self.inputs:
            if not self.live_aliases(chain, chain): return chain
            raise ValueError(f'{name}: in-place update of input {chain} while a view of it is read later')
        if source in self.fresh and chain not in self.aliased and not self.live_aliases(chain, chain): return source
        owners = self.owners(source)
        if len(owners) == 1:
            (owner,) = owners
            if owner in self.fresh and owner not in self.inputs and not self.live_aliases(owner, chain): return source
        raise ValueError(f'{name}: in-place operation requires a fresh unaliased producer or a single-use input')


def references(value):
    """The FX node names an encoded argument refers to."""
    if isinstance(value, dict):
        if set(value) == {'ref'}: return {value['ref']}
        return set().union(*(references(v) for v in value.values()))
    if isinstance(value, list): return set().union(*(references(v) for v in value))
    return set()


def expect(expr, meta):
    """Bind a value to the source graph's recorded type; Kiln checks it while tracing (nn.expect)."""
    return f'N.expect({expr}, {json.dumps(meta["shape"])}, {json.dumps(IMPORTED[meta["dtype"]])})'


def write_region(ctx, view, value, value_shape, var, lines):
    """The root of `view` with the view's region replaced by `value` (broadcast to the view's shape as
    PyTorch's copy_ does); every name of the root and every recorded view of it is rebound."""
    root = view.root
    if root in ctx.aliased: raise ValueError(f'{var}: in-place write through a view requires a fresh unaliased root (an untracked alias of {root} exists)')
    rmeta = ctx.metadata[root]
    region, shape = fx_assign.region_shape(view.entries), fx_assign.view_shape(view)
    y = value
    if value_shape is not None and (list(value_shape) != region):
        if list(value_shape) != shape: y = f'N.expand({y}, {json.dumps(shape)})'
        if shape != region: y = f'N.reshape({y}, {json.dumps(region)})'
    lines.append(f'const {var} = {expect(f"N.assign({ctx.values[root]}, {fx_assign.assign_index(view.entries)}, {y})", rmeta)};')
    for other in [n for n in ctx.values if ctx.root(n) == root and n not in ctx.views]: ctx.values[other] = var
    ctx.by_var.setdefault(var, root)
    # re-derive every recorded view of the root that a later node still reads
    for j, (vname, v) in enumerate([(n, v) for n, v in ctx.views.items() if v.root == root and ctx.last_use.get(n, -1) > ctx.at]):
        vvar = f'{var}_v{j}'
        lines.append(f'const {vvar} = {expect(_lower_index(var, fx_assign.read_key(v), rmeta["shape"], ctx.metadata[vname]["shape"]), ctx.metadata[vname])};')
        ctx.values[vname] = vvar; ctx.by_var[vvar] = vname


def lower_setitem(ctx, name, var, args, node, lines):
    """x[index] = value on a fresh root or a recorded view of one: functional slice assignment."""
    raw = node['args']['tuple']
    if len(args) != 3 or node['kwargs'] != {'dict': {}} and node['kwargs'] or not isinstance(raw[0], dict) or 'ref' not in raw[0]:
        raise ValueError(f'{name}: unsupported slice assignment arguments')
    target = raw[0]['ref']
    key = index_literal(ctx, name, args[1])
    if target in ctx.views: view = fx_assign.compose(ctx.views[target], key)
    elif ctx.owns(target): view = fx_assign.of(ctx.root(target), key, ctx.metadata[target]['shape'])
    else: raise ValueError(f'{name}: slice assignment requires a fresh unaliased tensor or a basic view of one')
    value = args[2]
    source = ctx.source_of(value)
    if source is not None:
        vmeta = ctx.metadata[source]
        if not isinstance(vmeta, dict): raise ValueError(f'{name}: assigned value must be a tensor or a number')
        write_region(ctx, view, value, vmeta['shape'], var, lines)
    else:
        literal = ctx.literal(value) if isinstance(value, str) else None
        if type(literal) not in (int, float, bool): raise ValueError(f'{name}: assigned value must be a tensor or a static number')
        number = f'N.bool({json.dumps(literal)})' if type(literal) is bool else js_int(literal) if type(literal) is int else json.dumps(literal)
        write_region(ctx, view, number, None, var, lines)


# the value of a slice assignment node (operator.setitem returns None): an output of it is {'none': True}
NO_RESULT = object()


FACTORY_TARGETS = ('torch.tensor', 'torch.arange', 'torch.zeros', 'torch.ones', 'torch.full', 'torch.linspace', 'torch.empty',
                   'torch.functional.meshgrid', 'torch.meshgrid')


def source_device(ctx, node):
    """The device the source program gives a node's value (the exported metadata is propagated on CPU).

    Inputs are CUDA tensors in the evaluator. A factory is on its device argument (CPU without one);
    .to(device)/.cuda()/.cpu() move; any other result is on CUDA when a tensor argument is."""
    if node['kind'] == 'placeholder': return 'cuda'
    def devices(value):
        if isinstance(value, dict):
            if set(value) == {'device'} and isinstance(value['device'], str): yield 'cuda' if value['device'].startswith('cuda') else 'cpu'
            else:
                for item in value.values(): yield from devices(item)
        elif isinstance(value, list):
            for item in value: yield from devices(item)
    def refs(value):
        if isinstance(value, dict):
            if set(value) == {'ref'}: yield value['ref']
            else:
                for item in value.values(): yield from refs(item)
        elif isinstance(value, list):
            for item in value: yield from refs(item)
    named = list(devices(node['args'])) + list(devices(node['kwargs']))
    if node['kind'] == 'call_method' and node['target'] in ('cuda', 'cpu'): return node['target']
    if node['kind'] == 'call_method' and node['target'] == 'to':
        # .to('cuda') / .to(device='cpu:0'): a device spelled as a string
        spelled = [v for v in list(node['args']['tuple'][1:]) + [node['kwargs']['dict'].get('device')] if isinstance(v, str) and v.split(':')[0] in ('cuda', 'cpu')]
        named += ['cuda' if v.startswith('cuda') else 'cpu' for v in spelled]
    if named: return named[-1]
    if node['kind'] == 'call_function' and node['target'] in FACTORY_TARGETS: return 'cpu'
    return 'cuda' if any(ctx.devices.get(r) == 'cuda' for r in refs(node['args'])) or any(ctx.devices.get(r) == 'cuda' for r in refs(node['kwargs'])) else 'cpu'


def import_graph(graph):
    if graph.get('format') != 'kiln-fx/1':
        raise ValueError('Expected kiln-fx/1')
    ctx = Context(graph)
    specs, input_dtypes, lines, outputs = {}, {}, [], None
    input_mutations, output_alias_values = {}, {}
    for i, node in enumerate(graph['nodes']):
        name = node['id']
        ctx.at = i
        if name in ctx.values: raise ValueError(f'Duplicate node: {name}')
        var = f'v{i}'
        ctx.devices[name] = source_device(ctx, node)
        meta = node.get('tensor_meta')
        if node['kind'] == 'placeholder':
            if not isinstance(meta, dict) or meta.get('dtype') not in IMPORTED:
                raise ValueError(f'{name}: only floating, integer and bool tensor inputs accepted')
            shape = meta['shape']
            if any(type(d) is not int or d <= 0 for d in shape): raise ValueError(f'{name}: positive static dimensions required')
            expected, size = [], 1
            for d in reversed(shape): expected.insert(0, size); size *= d
            if meta['strides'] != expected: raise ValueError(f'{name}: noncontiguous input requires layout lowering')
            specs[var] = shape; input_dtypes[var] = IMPORTED[meta['dtype']]
            ctx.bind_value(name, var); ctx.inputs[name] = len(ctx.inputs)
            continue
        args, kwargs = ctx.decode(node['args']), ctx.decode(node['kwargs'])
        if node['kind'] == 'output':
            outputs = args[0]
            continue
        if node['kind'] not in ('call_function', 'call_method'):
            raise ValueError(f'{name}: unsupported node kind {node["kind"]}')
        target = node['target']
        if node['kind'] == 'call_function' and target == '_operator.setitem':
            lower_setitem(ctx, name, var, args, node, lines)
            # the write's own result is None; corpus.expose_inplace_results may return it
            ctx.bind_value(name, NO_RESULT)
            continue
        spec = REGISTRY.lookup(node['kind'], target)
        if spec is None:
            if node['kind'] == 'call_method': raise ValueError(f'{name}: unsupported tensor method {target}')
            raise ValueError(f'{name}: unsupported target {target}; implement semantic lowering')
        lowered = spec.lower(Call(name, node['kind'], target, args, kwargs, node['args'], meta, ctx))
        expr = lowered.expr
        if isinstance(expr, list):
            if not isinstance(meta, (list, tuple)) or len(meta) != len(expr) or any(not isinstance(m, dict) or m.get('dtype') not in IMPORTED for m in meta):
                raise ValueError(f'{name}: supported result metadata required for every output')
            ctx.bind_value(name, [None if item is None else f'{var}_{j}' for j, item in enumerate(expr)])
            lines.extend(f'const {var}_{j} = {expect(item, meta[j])};' for j, item in enumerate(expr) if item is not None)
            if not spec.fresh:
                ctx.aliased.update(ctx.storage(r) for r in references(node['args']))
                ctx.alias_sources[name] = references(node['args'])
            continue
        if not isinstance(meta, dict) or meta.get('dtype') not in IMPORTED:
            raise ValueError(f'{name}: supported result metadata required')
        lines.append(f'const {var} = {expect(expr, meta)};')
        ctx.bind_value(name, var)
        fresh = spec.fresh if lowered.fresh is None else lowered.fresh
        if lowered.view_write is not None:
            # v += y on a view of a fresh root: write the new view value back into the root's region;
            # the result is the same view of the root
            view = ctx.views[lowered.view_write]
            write_region(ctx, view, var, meta['shape'], f'{var}_w', lines)
            ctx.views[name] = view
            continue
        if lowered.mutates in ctx.inputs:
            # the input's final value is the last update; every name of the chain reads the new value
            index = ctx.inputs[lowered.mutates]
            input_mutations[index] = var
            output_alias_values[var] = index
            ctx.roots[name] = lowered.mutates
            for other in [n for n in ctx.values if ctx.root(n) == lowered.mutates]: ctx.values[other] = var
        elif lowered.mutates is not None:
            # every name of the updated storage reads the new value from here on
            root = ctx.root(lowered.mutates)
            ctx.roots[name] = root
            for other in [n for n in ctx.values if ctx.root(n) == root]: ctx.values[other] = var
            ctx.fresh.add(name)
        elif not fresh:
            # a recorded basic-index view does not alias its root: writes through it are tracked
            ctx.alias_sources[name] = references(node['args'])
            if name not in ctx.views: ctx.aliased.update(ctx.storage(r) for r in references(node['args']))
        # Views, casts and disabled dropout may alias: their Op declares fresh=False, so they
        # never transfer ownership. Accepted in-place calls only consume an already owned value
        # whose sole use is this operation.
        else:
            ctx.fresh.add(name)
    if outputs is None: raise ValueError('Missing graph output')
    flat = []
    def flatten(v):
        if isinstance(v, (list, tuple)): return {'tuple' if isinstance(v, tuple) else 'list': [flatten(x) for x in v]}
        if isinstance(v, dict): return {'dict': {k: flatten(x) for k, x in v.items()}}
        if v is NO_RESULT: return {'none': True}
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
