"""Coverage-wave lowerings (integration Step 9+): small PyTorch operations each blocking one PassBench
family, composed from existing Kiln N operations.

  tensor methods   x.exp() / x.log() / x.sqrt() / x.rsqrt() / x.tanh() / x.abs() / x.floor()
  attributes       x.T, x.mT (builtins.getattr)
  copies           x.clone(), x.tile(dims)
  in-place fill    x.fill_(v) on a fresh value, an input or a recorded basic view (slice assignment)
  masks            torch.triu / torch.tril (index-value masks), torch.all / torch.any, ~x
  partitions       x.tensor_split(sections, dim)
  convolution      conv3d whose stride equals its kernel (non-overlapping patches): a patch linear
  pooling          avg_pool1d as avg_pool2d over a unit height axis
  attention        F.multi_head_attention_forward (eval, no dropout, no masks, packed q = k = v projection)

Independent lowering against PyTorch's documented semantics. No upstream implementation copied.
Arithmetic follows fx_import/fx_compose: f32 compute, narrow to the source dtype at the operation result.
"""
import json
import math
from dtypes import FLOATING, IMPORTED
from fx_ops import bind
from fx_compose import permute


UNARY_METHODS = ('exp', 'log', 'sqrt', 'rsqrt', 'tanh', 'abs', 'floor')


def lower_unary_method(c):
    """x.exp() etc.: the same N operation as torch.exp(x) (fx_import.UNARY)."""
    if len(c.args) != 1 or c.kwargs: raise ValueError(f'{c.name}: unsupported {c.target} arguments')
    return f'N.{c.target}({c.args[0]})'


def lower_getattr(c):
    """x.T reverses every axis (PyTorch: rank 0-2 recommended; any rank permutes reversed); x.mT swaps the last two."""
    if len(c.args) != 2 or c.kwargs: raise ValueError(f'{c.name}: getattr(tensor, name) required')
    name = c.ctx.literal(c.args[1])
    rank = len(c.ctx.resolve(c.args[0])['shape'])
    if name == 'T': return permute(c.args[0], list(reversed(range(rank))))
    if name == 'mT' and rank >= 2: return f'N.transpose({c.args[0]}, -2, -1)'
    raise ValueError(f'{c.name}: tensor attribute {name!r} is not lowered (T and mT only)')


def lower_clone(c):
    """x.clone(): a copy with fresh storage (memory_format preserve/contiguous only)."""
    bound = bind(c.name, 'clone', c.args, c.kwargs, ['self', 'memory_format'], require_first=True)
    if bound.get('memory_format', 'null') not in ('null', '"torch.preserve_format"', '"torch.contiguous_format"'):
        raise ValueError(f'{c.name}: clone memory_format unsupported')
    return f'N.reshape({bound["self"]}, {json.dumps(c.ctx.resolve(bound["self"])["shape"])})'


def lower_tile(c):
    """x.tile(dims): x.repeat with dims left-padded by ones to the input's rank."""
    dims = c.ctx.literal(c.args[1]) if len(c.args) == 2 and isinstance(c.args[1], (list, tuple)) else [c.ctx.literal(a) for a in c.args[1:]]
    rank = len(c.ctx.resolve(c.args[0])['shape'])
    if c.kwargs or not isinstance(dims, list) or any(type(d) is not int or d < 1 for d in dims): raise ValueError(f'{c.name}: static positive tile dims required')
    dims = [1] * (rank - len(dims)) + dims
    return f'N.repeat({c.args[0]}, {json.dumps(dims)})'


def fill_value(c, value, dtype):
    """A Python number as a Kiln operand converting to dtype (PyTorch's fill converts the Scalar to the tensor dtype)."""
    literal = c.ctx.literal(value)
    if type(literal) not in (int, float, bool): raise ValueError(f'{c.name}: fill_ value must be a static number')
    return f'N.full({json.dumps(c.meta["shape"])}, {json.dumps(literal)}, {json.dumps(IMPORTED[dtype])})'


def triangle(c, upper):
    """triu keeps x[..., i, j] where j - i >= diagonal; tril where j - i <= diagonal; the rest is 0."""
    bound = bind(c.name, 'triu' if upper else 'tril', c.args, c.kwargs, ['input', 'diagonal'], require_first=True)
    meta = c.ctx.resolve(bound['input'])
    d = c.ctx.literal(bound.get('diagonal', '0'))
    if type(d) is not int or len(meta['shape']) < 2: raise ValueError(f'{c.name}: static integer diagonal and rank >= 2 required')
    rows, cols = meta['shape'][-2:]
    keep = f'([i, j]) => j.ge(i.add({d}))' if upper else f'([i, j]) => j.le(i.add({d}))'
    zero = 'N.bool(false)' if meta['dtype'] == 'torch.bool' else 'N.int(0)' if meta['dtype'] in ('torch.int64', 'torch.int32') else '0'
    return f'N.select(N.indexValue([{rows}, {cols}], {keep}, "bool"), {bound["input"]}, {zero})'


def lower_all_any(c):
    """torch.all / torch.any (bool result): over a dimension or the whole tensor. all is min over bool
    values, any is max; non-bool inputs compare with zero first."""
    fn = c.target.rsplit('.', 1)[-1]
    bound = bind(c.name, fn, c.args, c.kwargs, ['input', 'dim', 'keepdim'], require_first=True)
    meta = c.ctx.resolve(bound['input']); shape = meta['shape']
    x = bound['input'] if meta['dtype'] == 'torch.bool' else f'N.ne({bound["input"]}, 0)'
    x = f'N.cast({x}, "i32")'
    reduce = 'amin' if fn == 'all' else 'amax'
    dim, keep = c.ctx.literal(bound.get('dim', 'null')), c.ctx.literal(bound.get('keepdim', 'false'))
    if type(keep) is not bool: raise ValueError(f'{c.name}: static keepdim required')
    if dim is None:
        for axis in range(len(shape)): x = f'N.{reduce}({x}, {axis}, true)'
        return f'N.cast(N.reshape({x}, {json.dumps([1] * len(shape) if keep else [])}), "bool")'
    if type(dim) is not int or not -len(shape) <= dim < len(shape): raise ValueError(f'{c.name}: static dim required')
    return f'N.cast(N.{reduce}({x}, {dim % len(shape)}, {json.dumps(keep)}), "bool")'


def lower_invert(c):
    """~x: logical not of a bool tensor (integer bitwise not is not lowered)."""
    if len(c.args) != 1 or c.kwargs or c.ctx.resolve(c.args[0])['dtype'] != 'torch.bool':
        raise ValueError(f'{c.name}: ~ is lowered for bool tensors only')
    return f'N.eq({c.args[0]}, N.bool(false))'


def lower_tensor_split(c):
    """x.tensor_split(n, dim): n parts along dim; the first size % n parts have one more element.
    x.tensor_split([i0, i1, ...], dim): parts between the given indices. Results are views (slices)."""
    first = 'self' if c.kind == 'call_method' else 'input'
    bound = bind(c.name, 'tensor_split', c.args, c.kwargs, [first, 'indices_or_sections', 'dim'], require_first=True)
    meta = c.ctx.resolve(bound[first]); shape = meta['shape']
    dim = c.ctx.literal(bound.get('dim', '0')); spec = c.ctx.literal(bound['indices_or_sections'])
    if type(dim) is not int or not -len(shape) <= dim < len(shape): raise ValueError(f'{c.name}: static dim required')
    dim %= len(shape); n = shape[dim]
    if type(spec) is int:
        if spec < 1: raise ValueError(f'{c.name}: positive section count required')
        base, extra = divmod(n, spec)
        bounds, at = [], 0
        for k in range(spec):
            size = base + (1 if k < extra else 0); bounds.append((at, at + size)); at += size
    elif isinstance(spec, list) and all(type(i) is int for i in spec):
        cuts = [min(max(i + n if i < 0 else i, 0), n) for i in spec]
        edges = [0, *cuts, n]
        bounds = [(edges[k], max(edges[k], edges[k + 1])) for k in range(len(edges) - 1)]
    else: raise ValueError(f'{c.name}: static sections or indices required')
    if not isinstance(c.meta, (list, tuple)) or len(c.meta) != len(bounds): raise ValueError(f'{c.name}: tensor_split output count mismatch')
    out = []
    for (start, end), m in zip(bounds, c.meta):
        if end <= start: raise ValueError(f'{c.name}: empty tensor_split part is not lowered')
        expected = shape.copy(); expected[dim] = end - start
        if m['shape'] != expected: raise ValueError(f'{c.name}: tensor_split part shape mismatch')
        out.append(f'N.slice({bound[first]}, {dim}, {start}, {end})')
    return out


def lower_conv3d(c):
    """conv3d with stride == kernel, no padding, dilation 1, groups 1 (video patch embedding): every output
    voxel reads its own input patch, so it is a linear map of patches.
    [N, C, T, H, W] -> [N, C, T', kt, H', kh, W', kw] -> [N, T', H', W', C, kt, kh, kw] -> [N*T'*H'*W', C*kt*kh*kw],
    times the weight [O, C*kt*kh*kw]^T, back to [N, O, T', H', W']. The product runs in f32 and narrows to the
    source dtype; the bias is then added in the source dtype (ATen adds a cuDNN convolution's bias to the output)."""
    bound = bind(c.name, 'conv3d', c.args, c.kwargs, ['input', 'weight', 'bias', 'stride', 'padding', 'dilation', 'groups'], require_first=True)
    (x, dtype), w = (c.ctx.resolve(bound['input']), None), c.ctx.resolve(bound['weight'])
    triple = lambda v: [v] * 3 if type(v) is int else list(v)
    stride, padding, dilation = (triple(c.ctx.literal(bound.get(k, d))) for k, d in [('stride', '1'), ('padding', '0'), ('dilation', '1')])
    groups = c.ctx.literal(bound.get('groups', '1'))
    if x['dtype'] not in FLOATING or w['dtype'] != x['dtype'] or len(x['shape']) != 5 or len(w['shape']) != 5:
        raise ValueError(f'{c.name}: batched 5-d floating input and weight of one dtype required')
    n, ch, *spatial = x['shape']; o, wc, *kernel = w['shape']
    if stride != kernel or padding != [0, 0, 0] or dilation != [1, 1, 1] or groups != 1 or wc != ch or any(s % k for s, k in zip(spatial, kernel)):
        raise ValueError(f'{c.name}: only non-overlapping conv3d (stride == kernel, no padding, dilation 1, groups 1) is lowered')
    out = [s // k for s, k in zip(spatial, kernel)]
    split = [n, ch, out[0], kernel[0], out[1], kernel[1], out[2], kernel[2]]
    patches = permute(f'N.reshape(N.cast({bound["input"]}, "f32"), {json.dumps(split)})', [0, 2, 4, 6, 1, 3, 5, 7])
    rows, cols = n * math.prod(out), ch * math.prod(kernel)
    weight = f'N.reshape(N.cast({bound["weight"]}, "f32"), {json.dumps([o, cols])})'
    product = f'N.linear(N.reshape({patches}, {json.dumps([rows, cols])}), {weight}, null)'
    y = permute(f'N.reshape({product}, {json.dumps([n, *out, o])})', [0, 4, 1, 2, 3])
    y = f'N.cast({y}, {json.dumps(FLOATING[x["dtype"]])})'
    bias = bound.get('bias', 'null')
    if bias != 'null':
        if c.ctx.resolve(bias)['shape'] != [o] or c.ctx.resolve(bias)['dtype'] != x['dtype']: raise ValueError(f'{c.name}: conv3d bias must be [out_channels] of the input dtype')
        y = f'N.add({y}, N.reshape({bias}, {json.dumps([1, o, 1, 1, 1])}))'
    return y


def lower_avg_pool1d(c):
    """avg_pool1d over [N, C, L] (or [C, L]) is avg_pool2d over [N, C, 1, L] with a unit-height window."""
    bound = bind(c.name, 'avg_pool1d', c.args, c.kwargs, ['input', 'kernel_size', 'stride', 'padding', 'ceil_mode', 'count_include_pad'], require_first=True)
    meta = c.ctx.resolve(bound['input']); shape = meta['shape']
    one = lambda v: v[0] if isinstance(v, list) and len(v) == 1 else v
    kernel = one(c.ctx.literal(bound.get('kernel_size', 'null')))
    stride = one(c.ctx.literal(bound.get('stride', 'null'))); stride = kernel if stride in (None, []) else stride
    pad = one(c.ctx.literal(bound.get('padding', '0')))
    ceil, include = c.ctx.literal(bound.get('ceil_mode', 'false')), c.ctx.literal(bound.get('count_include_pad', 'true'))
    if any(type(v) is not int for v in (kernel, stride, pad)) or type(ceil) is not bool or type(include) is not bool or len(shape) not in (2, 3):
        raise ValueError(f'{c.name}: static avg_pool1d options over a 2-d or 3-d input required')
    if meta['dtype'] not in FLOATING: raise ValueError(f'{c.name}: avg_pool1d requires a floating tensor')
    options = {'kernel_size': [1, kernel], 'stride': [1, stride], 'padding': [0, pad], 'ceil_mode': ceil, 'count_include_pad': include, 'divisor_override': None}
    lifted = f'N.reshape({bound["input"]}, {json.dumps([*shape[:-1], 1, shape[-1]])})'
    return f'N.reshape(N.avgPool2d({lifted}, {json.dumps(options)}), {json.dumps(c.meta["shape"])})'


def lower_multi_head_attention(c):
    """F.multi_head_attention_forward in eval mode with q = k = v (self-attention), a packed in-projection,
    no bias_k/bias_v, no zero-attention row, no masks, dropout 0 and batch_first=False inputs [L, N, E]:
      qkv = x W_in^T + b_in, split into q, k, v [L, N, E] -> heads [N*h, L, d]
      out = softmax((q / sqrt(d)) k^T) v -> [L, N, E] -> out W_out^T + b_out
    Each step (the projections, the scaling, both bmm products, softmax) computes in f32 and rounds to the
    source dtype where PyTorch's need_weights path (explicit bmm + softmax) produces a tensor.
    Result 0 is the output; result 1 (the attention weights) is not lowered."""
    fields = ['query', 'key', 'value', 'embed_dim_to_check', 'num_heads', 'in_proj_weight', 'in_proj_bias', 'bias_k', 'bias_v',
              'add_zero_attn', 'dropout_p', 'out_proj_weight', 'out_proj_bias', 'training', 'key_padding_mask', 'need_weights',
              'attn_mask', 'use_separate_proj_weight', 'q_proj_weight', 'k_proj_weight', 'v_proj_weight', 'static_k', 'static_v',
              'average_attn_weights', 'is_causal']
    b = bind(c.name, 'multi_head_attention_forward', c.args, c.kwargs, fields, require_first=True)
    lit = lambda k, d='null': c.ctx.literal(b.get(k, d))
    if not (b['query'] == b['key'] == b['value']): raise ValueError(f'{c.name}: only self-attention (query is key is value) is lowered')
    if lit('training', 'true') is not False or lit('dropout_p', '0.0') != 0 or lit('add_zero_attn', 'false') is not False or lit('is_causal', 'false') is not False \
            or lit('use_separate_proj_weight', 'false') is not False or any(b.get(k, 'null') != 'null' for k in ('bias_k', 'bias_v', 'key_padding_mask', 'attn_mask', 'static_k', 'static_v')):
        raise ValueError(f'{c.name}: only eval-mode packed self-attention without masks, bias_k/v or dropout is lowered')
    x = c.ctx.resolve(b['query'])
    if x['dtype'] not in FLOATING or len(x['shape']) != 3: raise ValueError(f'{c.name}: floating [L, N, E] input required')
    L, N, E = x['shape']; h = lit('num_heads')
    if lit('embed_dim_to_check') != E or type(h) is not int or E % h: raise ValueError(f'{c.name}: embed_dim must equal E and divide by num_heads')
    d = E // h
    if c.ctx.resolve(b['in_proj_weight'])['shape'] != [3 * E, E] or c.ctx.resolve(b['out_proj_weight'])['shape'] != [E, E]:
        raise ValueError(f'{c.name}: packed in-projection [3E, E] and out-projection [E, E] required')
    dt = json.dumps(FLOATING[x['dtype']])
    # every PyTorch operation of the decomposition rounds its result to the source dtype (a no-op in f32)
    r = lambda e: f'N.cast(N.cast({e}, {dt}), "f32")'
    f = lambda k: 'null' if b.get(k, 'null') == 'null' else f'N.cast({b[k]}, "f32")'
    qkv = r(f'N.linear(N.cast({b["query"]}, "f32"), {f("in_proj_weight")}, {f("in_proj_bias")})')
    def head(part):
        # [L, N, 3E] -> part p of [L, N, E] -> [L, N*h, d] -> [N*h, L, d]
        return f'N.transpose(N.reshape(N.slice({qkv}, 2, {part * E}, {(part + 1) * E}), {json.dumps([L, N * h, d])}), 0, 1)'
    q = r(f'N.mul({head(0)}, {json.dumps(math.sqrt(1.0 / d))})')
    scores = r(f'N.matmul({q}, N.transpose({head(1)}, -2, -1))')
    attended = r(f'N.matmul({r(f"N.softmax({scores}, -1)")}, {head(2)})')
    merged = f'N.reshape(N.transpose({attended}, 0, 1), {json.dumps([L * N, E])})'
    out = f'N.cast(N.reshape(N.linear({merged}, {f("out_proj_weight")}, {f("out_proj_bias")}), {json.dumps([L, N, E])}), {dt})'
    return [out, None]
