"""Static scalar pointwise bindings; mutation permission belongs to the importer."""
import json
import math

FUNCTIONS = {
    'torch.nn.functional.hardtanh': 'hardtanh',
    'aten.hardtanh.default': 'hardtanh', 'aten.hardtanh_.default': 'hardtanh_',
    'torch.clamp': 'clamp', 'torch.clip': 'clamp',
    'aten.clamp.default': 'clamp', 'aten.clamp_.default': 'clamp_',
    'torch.pow': 'pow', '_operator.pow': 'pow', 'aten.pow.Tensor_Scalar': 'pow',
    'torch.cos': 'cos', 'aten.cos.default': 'cos',
    'torch.sin': 'sin', 'aten.sin.default': 'sin',
    'torch.square': 'square', 'aten.square.default': 'square',
    'torch.nn.functional.leaky_relu': 'leaky_relu',
    'torch.nn.functional.hardsigmoid': 'hardsigmoid',
    'torch.nn.functional.hardswish': 'hardswish',
}
METHODS = {'clamp': 'clamp', 'clamp_': 'clamp_', 'clip': 'clamp', 'clip_': 'clamp_',
           'pow': 'pow', 'pow_': 'pow_', 'cos': 'cos', 'sin': 'sin', 'square': 'square'}
from dtypes import FLOATING


def exponent_tensor(value, resolve):
    """The tensor metadata of a pow exponent that references a tensor, else None (a scalar literal)."""
    if value is None: return None
    try: return resolve(value)
    except ValueError: return None


def lower_scalar(target, kind, args, kwargs, meta, resolve, literal):
    """Return (expression, input variable, mutates_input).

    All accepted operations allocate fresh logical outputs. For mutations the
    caller MUST prove input is a fresh single-use producer before using expression.
    """
    op = (METHODS if kind == 'call_method' else FUNCTIONS)[target]
    first = 'self' if kind == 'call_method' or target.startswith('aten.') else 'input'
    fields = [first]
    if op.startswith('hardtanh'):
        fields += ['min_val', 'max_val']
        if target == 'torch.nn.functional.hardtanh': fields += ['inplace']
    elif op.startswith('clamp'): fields += ['min', 'max']
    elif op in ('pow', 'pow_'): fields += ['exponent']
    elif op == 'leaky_relu': fields += ['negative_slope', 'inplace']
    elif op in ('hardsigmoid', 'hardswish'): fields += ['inplace']
    if len(args) > len(fields) or set(kwargs) - set(fields):
        raise ValueError(f'{op}: unsupported arguments')
    bound = dict(zip(fields, args))
    if set(bound) & set(kwargs): raise ValueError(f'{op}: duplicate argument')
    bound.update(kwargs)
    if first not in bound: raise ValueError(f'{op}: input required')
    value = bound[first]
    source = resolve(value)
    if op in ('pow', 'pow_') and source['dtype'] in ('torch.int64', 'torch.int32') and meta['dtype'] == source['dtype'] and not op.endswith('_'):
        # an integer square (ConViT's relative distances) is an exact integer product; other integer
        # exponents would need integer pow
        if literal(bound.get('exponent', 'null')) != 2 or type(literal(bound.get('exponent', 'null'))) is not int:
            raise ValueError(f'{op}: integer pow is lowered for the exponent 2 only')
        return f'N.mul({value}, {value})', value, False
    if source['dtype'] not in FLOATING or meta['dtype'] != source['dtype'] or meta['shape'] != source['shape']:
        raise ValueError(f'{op}: dtype-preserving floating tensor required')
    dtype = json.dumps(FLOATING[source['dtype']])
    inplace = literal(bound.get('inplace', 'false'))
    if type(inplace) is not bool: raise ValueError(f'{op}: static Boolean inplace required')
    inplace = inplace or op.endswith('_')
    x = f'N.cast({value}, "f32")'

    def scalar(field, default):
        try: number = literal(bound.get(field, default))
        except (ValueError, TypeError): raise ValueError(f'{op}: finite scalar {field} required') from None
        if number is not None and (type(number) not in (int, float) or not math.isfinite(number)):
            raise ValueError(f'{op}: finite scalar {field} required')
        return number

    if op.startswith(('clamp', 'hardtanh')):
        hard = op.startswith('hardtanh')
        low = scalar('min_val' if hard else 'min', '-1' if hard else 'null')
        high = scalar('max_val' if hard else 'max', '1' if hard else 'null')
        if hard and (low is None or high is None or low > high):
            raise ValueError('hardtanh: ordered finite bounds required')
        if low is None and high is None: raise ValueError('clamp: at least one bound required')
        # PyTorch converts Scalar bounds to the input storage dtype first.
        # Select preserves input NaNs and signed zeros, unlike fmaxf/fminf.
        for number, comparison in [(low, 'lt'), (high, 'gt')]:
            if number is not None:
                b = f'N.cast(N.cast(N.const({json.dumps(number)}, []), {dtype}), "f32")'
                x = f'N.select(N.{comparison}({x}, {b}), {b}, {x})'
    elif op in ('pow', 'pow_') and exponent_tensor(bound.get('exponent'), resolve) is not None:
        # a tensor exponent: elementwise pow in f32 (PyTorch's tensor-tensor kernel has no special cases)
        e = exponent_tensor(bound['exponent'], resolve)
        if e['dtype'] != source['dtype']: raise ValueError('pow: tensor exponent must have the base dtype')
        x = f'N.pow({x}, N.cast({bound["exponent"]}, "f32"))'
    elif op in ('pow', 'pow_'):
        exponent = scalar('exponent', 'null')
        # PyTorch's tensor-scalar pow kernel specializes 0.5 (sqrt), -0.5 (rsqrt) and -1 (reciprocal)
        roots = {0.5: f'N.sqrt({x})', -0.5: f'N.rsqrt({x})', -1: f'N.div(1, {x})'}
        if exponent in roots and exponent is not True: x = roots[exponent]
        elif exponent is None or exponent != int(exponent) or abs(exponent) > 2**24:
            raise ValueError('pow: exactly representable integer scalar exponent required')
        else:
            # PyTorch specializes square; multiplication also defines negative bases
            # on WGSL, whose builtin pow otherwise has a nonnegative-base domain.
            special = {2: 'square'}
            x = f'N.{special[exponent]}({x})' if exponent in special else f'N.pow({x}, {json.dumps(exponent)})'
    elif op == 'leaky_relu':
        slope = scalar('negative_slope', '0.01')
        if slope is None: raise ValueError('leaky_relu: finite negative_slope required')
        x = f'N.select(N.gt({x}, 0), {x}, N.mul({x}, {json.dumps(slope)}))'
    elif op == 'hardsigmoid':
        middle = f'N.add(N.div({x}, 6), 0.5)'
        x = f'N.select(N.lt({x}, -3), 0, N.select(N.gt({x}, 3), 1, {middle}))'
    elif op == 'hardswish':
        clipped = f'N.select(N.lt({x}, -3), 0, N.select(N.gt({x}, 3), 6, N.add({x}, 3)))'
        x = f'N.mul({x}, N.div({clipped}, 6))'
    else:
        x = f'N.{op}({x})'
    return f'N.cast({x}, {dtype})', value, inplace
