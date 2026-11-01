"""Operations composed from existing Kiln N operations: vector norms, normalize, prelu, two-operand
einsum and scaled dot-product attention. Arithmetic runs in f32 and narrows to the source dtype at
the operation's result, PyTorch's opmath rounding point; norm and the division in normalize narrow
where PyTorch's own decomposition rounds.

Independent lowering against PyTorch's documented semantics. No upstream implementation copied.
"""
import json
import math
from fx_ops import bind
from dtypes import FLOATING


def floating(c, value, what):
    meta = c.ctx.resolve(value)
    if meta['dtype'] not in FLOATING: raise ValueError(f'{c.name}: {what} requires a floating tensor, got {meta["dtype"]}')
    return meta, FLOATING[meta['dtype']]


def permute(expr, dims):
    """N.transpose steps taking axis dims[i] to position i."""
    current = list(range(len(dims)))
    for axis, wanted in enumerate(dims):
        other = current.index(wanted)
        if other != axis:
            expr = f'N.transpose({expr}, {axis}, {other})'
            current[axis], current[other] = current[other], current[axis]
    return expr


def axes(c, dims, rank, what):
    dims = list(range(rank)) if dims is None else [dims] if type(dims) is int else dims
    if not isinstance(dims, list) or any(type(d) is not int or not -rank <= d < rank for d in dims):
        raise ValueError(f'{c.name}: {what} requires static integer dimensions')
    dims = sorted({d % rank for d in dims})
    return dims


def two_norm(x, shape, dims, keepdim):
    """sqrt(sum x^2) over dims in f32."""
    expr = f'N.mul(N.cast({x}, "f32"), N.cast({x}, "f32"))'
    for axis in dims: expr = f'N.sum({expr}, {axis}, true)'
    expr = f'N.sqrt({expr})'
    if not keepdim: expr = f'N.reshape({expr}, {json.dumps([d for i, d in enumerate(shape) if i not in dims])})'
    return expr


def lower_norm(c):
    first = 'self' if c.kind == 'call_method' else 'input'
    bound = bind(c.name, 'norm', c.args, c.kwargs, [first, 'p', 'dim', 'keepdim', 'out', 'dtype'], require_first=False)
    meta, dtype = floating(c, bound[first], 'norm')
    p = c.ctx.literal(bound.get('p', '"fro"'))
    if p not in ('fro', 2, 2.0, None): raise ValueError(f'{c.name}: only the 2-norm is lowered (p={p})')
    if c.ctx.literal(bound.get('out', 'null')) is not None or c.ctx.literal(bound.get('dtype', 'null')) is not None:
        raise ValueError(f'{c.name}: norm out/dtype arguments unsupported')
    keep = c.ctx.literal(bound.get('keepdim', 'false'))
    if type(keep) is not bool: raise ValueError(f'{c.name}: keepdim must be Boolean')
    shape = meta['shape']
    dims = axes(c, c.ctx.literal(bound.get('dim', 'null')), len(shape), 'norm')
    return f'N.cast({two_norm(bound[first], shape, dims, keep)}, {json.dumps(dtype)})'


def lower_normalize(c):
    bound = bind(c.name, 'normalize', c.args, c.kwargs, ['input', 'p', 'dim', 'eps', 'out'], require_first=False)
    meta, dtype = floating(c, bound['input'], 'normalize')
    p, eps = c.ctx.literal(bound.get('p', '2.0')), c.ctx.literal(bound.get('eps', '1e-12'))
    if p not in (2, 2.0) or type(eps) not in (int, float) or c.ctx.literal(bound.get('out', 'null')) is not None:
        raise ValueError(f'{c.name}: only p=2 normalize with a scalar eps is lowered')
    shape = meta['shape']
    dims = axes(c, c.ctx.literal(bound.get('dim', '1')), len(shape), 'normalize')
    # PyTorch: x / x.norm(p, dim, keepdim=True).clamp_min(eps); the norm rounds to the input dtype first
    norm = f'N.cast({two_norm(bound["input"], shape, dims, True)}, {json.dumps(dtype)})'
    return f'N.div({bound["input"]}, N.max({norm}, {json.dumps(eps)}))'


def lower_prelu(c):
    bound = bind(c.name, 'prelu', c.args, c.kwargs, ['input', 'weight'], require_first=False)
    meta, dtype = floating(c, bound['input'], 'prelu')
    wmeta, _ = floating(c, bound['weight'], 'prelu')
    shape, n = meta['shape'], math.prod(wmeta['shape'])
    if wmeta['dtype'] != meta['dtype'] or len(wmeta['shape']) > 1: raise ValueError(f'{c.name}: prelu weight must be a vector of the input dtype')
    x, w = bound['input'], bound['weight']
    if n != 1:
        if len(shape) < 2 or shape[1] != n: raise ValueError(f'{c.name}: prelu weight must match the channel dimension')
        w = f'N.reshape({w}, {json.dumps([1, n] + [1] * (len(shape) - 2))})'
    else:
        w = f'N.reshape({w}, [])'
    return f'N.select(N.gt({x}, 0), {x}, N.mul({w}, {x}))'


def lower_einsum(c):
    """Two operands without ellipsis or repeated letters: permute to (batch, free, contracted), one
    batched matmul, then permute to the output order."""
    if c.kwargs or len(c.args) < 2: raise ValueError(f'{c.name}: einsum(equation, a, b) required')
    equation = c.ctx.literal(c.args[0])
    operands = list(c.args[1:])
    if len(operands) == 1 and isinstance(operands[0], (list, tuple)): operands = list(operands[0])
    if type(equation) is not str or len(operands) != 2 or '...' in equation or '->' not in equation:
        raise ValueError(f'{c.name}: only explicit two-operand einsum without ellipsis is lowered')
    inputs, out = equation.replace(' ', '').split('->')
    la, lb = inputs.split(',')
    (ma, dtype), (mb, _) = floating(c, operands[0], 'einsum'), floating(c, operands[1], 'einsum')
    if ma['dtype'] != mb['dtype']: raise ValueError(f'{c.name}: einsum operands must share a dtype')
    if any(len(set(s)) != len(s) for s in (la, lb, out)) or len(la) != len(ma['shape']) or len(lb) != len(mb['shape']):
        raise ValueError(f'{c.name}: einsum letters must be distinct per operand and match ranks')
    size = {}
    for letters, shape in ((la, ma['shape']), (lb, mb['shape'])):
        for l, d in zip(letters, shape):
            if size.setdefault(l, d) != d: raise ValueError(f'{c.name}: einsum dimension {l} differs between operands')
    batch = [l for l in out if l in la and l in lb]
    contracted = [l for l in la if l in lb and l not in out]
    left, right = [l for l in la if l not in lb], [l for l in lb if l not in la]
    if set(out) != set(batch + left + right) or any(l not in out for l in left + right):
        raise ValueError(f'{c.name}: einsum sums over a letter of one operand only; not lowered')
    prod = lambda ls: math.prod(size[l] for l in ls)
    a = permute(f'N.cast({operands[0]}, "f32")', [la.index(l) for l in batch + left + contracted])
    b = permute(f'N.cast({operands[1]}, "f32")', [lb.index(l) for l in batch + contracted + right])
    a = f'N.reshape({a}, {json.dumps([prod(batch), prod(left), prod(contracted)])})'
    b = f'N.reshape({b}, {json.dumps([prod(batch), prod(contracted), prod(right)])})'
    product = batch + left + right
    expr = f'N.reshape(N.matmul({a}, {b}), {json.dumps([size[l] for l in product])})'
    expr = permute(expr, [product.index(l) for l in out])
    return f'N.cast({expr}, {json.dumps(dtype)})'


def lower_sdpa(c):
    """softmax(q k^T * scale + mask) v. A bool mask keeps positions where it is true; a floating mask
    is added; is_causal keeps key j for query i when j <= i (PyTorch's top-left aligned lower triangle,
    an index-value mask). Dropout must be 0 and grouped-query attention is not lowered."""
    bound = bind(c.name, 'scaled_dot_product_attention', c.args, c.kwargs,
                 ['query', 'key', 'value', 'attn_mask', 'dropout_p', 'is_causal', 'scale', 'enable_gqa'], require_first=False)
    (mq, dtype), (mk, _), (mv, _) = (floating(c, bound[f], 'attention') for f in ('query', 'key', 'value'))
    causal = c.ctx.literal(bound.get('is_causal', 'false'))
    if c.ctx.literal(bound.get('dropout_p', '0.0')) != 0 or type(causal) is not bool \
            or c.ctx.literal(bound.get('enable_gqa', 'false')) is not False:
        raise ValueError(f'{c.name}: attention with dropout or GQA is not lowered')
    if not (mq['dtype'] == mk['dtype'] == mv['dtype']) or mq['shape'][:-2] != mk['shape'][:-2] or mk['shape'][:-1] != mv['shape'][:-1] or mq['shape'][-1] != mk['shape'][-1]:
        raise ValueError(f'{c.name}: attention operand shapes or dtypes disagree')
    scale = c.ctx.literal(bound.get('scale', 'null'))
    scale = 1 / math.sqrt(mq['shape'][-1]) if scale is None else scale
    q, k, v = (f'N.cast({bound[f]}, "f32")' for f in ('query', 'key', 'value'))
    # PyTorch runs f32 attention in the memory-efficient kernel, whose products are FP32 even with
    # TF32 enabled (probe 675): pin both products to FP32
    scores = f'N.mul(N.matmul({q}, N.transpose({k}, -2, -1), "highest"), {json.dumps(scale)})'
    mask = bound.get('attn_mask', 'null')
    if causal:
        # PyTorch rejects an explicit mask together with is_causal; row 0 always keeps key 0
        if mask != 'null': raise ValueError(f'{c.name}: attn_mask with is_causal=True is invalid')
        scores = f'N.select(N.causalMask({mq["shape"][-2]}, {mk["shape"][-2]}), {scores}, -Infinity)'
    elif mask != 'null':
        mm = c.ctx.resolve(mask)
        if mm['dtype'] == 'torch.bool': scores = f'N.select({mask}, {scores}, -Infinity)'
        elif mm['dtype'] in FLOATING: scores = f'N.add({scores}, N.cast({mask}, "f32"))'
        else: raise ValueError(f'{c.name}: attention mask dtype {mm["dtype"]} unsupported')
    # a fully masked row is 0, not NaN, in PyTorch's attention (N.safeSoftmax)
    return f'N.cast(N.matmul(N.safeSoftmax({scores}, -1), {v}, "highest"), {json.dumps(dtype)})'


def lower_im2col(c):
    """F.unfold (im2col): sliding windows over the last two axes, then
    [N, C, oh, ow, kh, kw] -> [N, C, kh, kw, oh, ow] -> [N, C*kh*kw, oh*ow]."""
    bound = bind(c.name, 'unfold', c.args, c.kwargs, ['input', 'kernel_size', 'dilation', 'padding', 'stride'], require_first=False)
    meta = c.ctx.resolve(bound['input'])
    pair = lambda v: [v, v] if type(v) is int else list(v)
    k, d, p, s = (pair(c.ctx.literal(bound.get(f, default))) for f, default in [('kernel_size', 'null'), ('dilation', '1'), ('padding', '0'), ('stride', '1')])
    if len(meta['shape']) != 4 or d != [1, 1] or any(type(v) is not int for v in k + p + s): raise ValueError(f'{c.name}: 4-d input, static sizes and dilation 1 required')
    n, ch, h, w = meta['shape']
    x = bound['input']
    if p != [0, 0]: x = f'N.pad({x}, {json.dumps([p[1], p[1], p[0], p[0]])})'
    oh, ow = (h + 2 * p[0] - k[0]) // s[0] + 1, (w + 2 * p[1] - k[1]) // s[1] + 1
    windows = f'N.unfold(N.unfold({x}, 2, {k[0]}, {s[0]}), 3, {k[1]}, {s[1]})'
    return f'N.reshape({permute(windows, [0, 1, 4, 5, 2, 3])}, {json.dumps([n, ch * k[0] * k[1], oh * ow])})'
