"""Static values-only max_pool2d binding (PyTorch v2.9.1 semantics)."""
import json

MAX_POOL2D = {'torch.nn.functional.max_pool2d', 'torch.max_pool2d', 'aten.max_pool2d.default'}


def lower_max_pool2d(target, args, kwargs, meta, resolve, literal):
    first = 'self' if target.startswith('aten.') else 'input'
    fields = [first, 'kernel_size', 'stride', 'padding', 'dilation', 'ceil_mode']
    if not target.startswith('aten.'):
        fields.append('return_indices')
    if len(args) > len(fields) or set(kwargs) - set(fields):
        raise ValueError('max_pool2d: unsupported arguments')
    bound = dict(zip(fields, args))
    if set(bound) & set(kwargs):
        raise ValueError('max_pool2d: duplicate argument')
    bound.update(kwargs)
    if first not in bound or 'kernel_size' not in bound:
        raise ValueError('max_pool2d: input and kernel_size required')
    source = resolve(bound[first])
    shape = source['shape']
    if len(shape) not in (3, 4) or any(type(v) is not int or v <= 0 for v in shape) or source['dtype'] not in ('torch.float32', 'torch.float16', 'torch.bfloat16'):
        raise ValueError('max_pool2d: positive floating CHW/NCHW input required')
    options = {key: literal(bound.get(key, default)) for key, default in [('kernel_size', 'null'), ('stride', 'null'), ('padding', '0'), ('dilation', '1'), ('ceil_mode', 'false'), ('return_indices', 'false')]}
    def pair(value, name):
        if type(value) is int:
            return [value, value]
        if isinstance(value, (list, tuple)) and len(value) in (1, 2) and all(type(x) is int for x in value):
            return list(value) * 2 if len(value) == 1 else list(value)
        raise ValueError('max_pool2d: invalid ' + name)
    kernel = pair(options['kernel_size'], 'kernel_size')
    stride = pair(kernel if options['stride'] in (None, []) else options['stride'], 'stride')
    pad, dilation = pair(options['padding'], 'padding'), pair(options['dilation'], 'dilation')
    if any(k <= 0 or s <= 0 or d <= 0 or p < 0 or p > k // 2 for k, s, p, d in zip(kernel, stride, pad, dilation)):
        raise ValueError('max_pool2d: invalid kernel/stride/padding/dilation')
    if type(options['ceil_mode']) is not bool or options['return_indices'] is not False:
        raise ValueError('max_pool2d: boolean ceil_mode and return_indices=False required')
    output = []
    for size, k, s, p, d in zip(shape[-2:], kernel, stride, pad, dilation):
        count = (size + 2*p - d*(k-1) - 1 + (s-1 if options['ceil_mode'] else 0)) // s + 1
        if options['ceil_mode'] and (count-1)*s >= size+p:
            count -= 1
        if count <= 0:
            raise ValueError('max_pool2d: output must be positive')
        output.append(count)
    if meta['shape'] != shape[:-2] + output or meta['dtype'] != source['dtype']:
        raise ValueError('max_pool2d: result shape/dtype mismatch')
    options.update(kernel_size=kernel, stride=stride, padding=pad, dilation=dilation)
    return f'N.maxPool2d({bound[first]}, {json.dumps(options)})'
