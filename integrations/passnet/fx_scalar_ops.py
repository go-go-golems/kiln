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
}
METHODS = {'clamp': 'clamp', 'clamp_': 'clamp_', 'clip': 'clamp', 'clip_': 'clamp_',
           'pow': 'pow', 'cos': 'cos', 'sin': 'sin'}
DTYPES = {'torch.float32': 'f32', 'torch.float16': 'f16', 'torch.bfloat16': 'bf16'}


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
    elif op == 'pow': fields += ['exponent']
    if len(args) > len(fields) or set(kwargs) - set(fields):
        raise ValueError(f'{op}: unsupported arguments')
    bound = dict(zip(fields, args))
    if set(bound) & set(kwargs): raise ValueError(f'{op}: duplicate argument')
    bound.update(kwargs)
    if first not in bound: raise ValueError(f'{op}: input required')
    value = bound[first]
    source = resolve(value)
    if source['dtype'] not in DTYPES or meta['dtype'] != source['dtype'] or meta['shape'] != source['shape']:
        raise ValueError(f'{op}: dtype-preserving floating tensor required')
    dtype = json.dumps(DTYPES[source['dtype']])
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
    elif op == 'pow':
        exponent = scalar('exponent', 'null')
        if exponent is None or exponent != int(exponent) or abs(exponent) > 2**24:
            raise ValueError('pow: exactly representable integer scalar exponent required')
        # PyTorch specializes square; multiplication also defines negative bases
        # on WGSL, whose builtin pow otherwise has a nonnegative-base domain.
        special = {2: 'square'}
        x = f'N.{special[exponent]}({x})' if exponent in special else f'N.pow({x}, {json.dumps(exponent)})'
    else:
        x = f'N.{op}({x})'
    return f'N.cast({x}, {dtype})', value, inplace
