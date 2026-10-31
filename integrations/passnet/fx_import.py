"""Translate kiln-fx/1 into a Kiln project script with explicit coverage errors.

Independent lowering against Kiln N APIs. No upstream implementation copied.
"""
import json


def import_graph(graph):
    if graph.get('format') != 'kiln-fx/1':
        raise ValueError('Expected kiln-fx/1')
    values, specs, lines, outputs = {}, {}, [], None
    metadata = {n['id']: n.get('tensor_meta') for n in graph['nodes']}

    def decode(v):
        if isinstance(v, dict):
            if set(v) == {'ref'}:
                if v['ref'] not in values:
                    raise ValueError(f'Unknown or forward reference: {v["ref"]}')
                return values[v['ref']]
            if set(v) in ({'tuple'}, {'list'}):
                items = [decode(x) for x in next(iter(v.values()))]
                return tuple(items) if 'tuple' in v else items
            if set(v) == {'dict'}:
                return {k: decode(x) for k, x in v['dict'].items()}
            raise ValueError(f'Unsupported encoded value: {v}')
        if v is None or isinstance(v, (str, int, float, bool)):
            return json.dumps(v)
        raise ValueError(f'Invalid argument: {v}')

    for i, node in enumerate(graph['nodes']):
        name = node['id']
        if name in values:
            raise ValueError(f'Duplicate node: {name}')
        var = f'v{i}'
        meta = node.get('tensor_meta')
        if node['kind'] == 'placeholder':
            if not isinstance(meta, dict) or meta.get('dtype') != 'torch.float32':
                raise ValueError(f'{name}: only FP32 tensor inputs supported currently')
            shape = meta['shape']
            if any(type(d) is not int or d <= 0 for d in shape):
                raise ValueError(f'{name}: positive static dimensions required')
            stride, expected = meta['strides'], []
            size = 1
            for d in reversed(shape):
                expected.insert(0, size); size *= d
            if stride != expected:
                raise ValueError(f'{name}: noncontiguous input requires layout lowering')
            specs[var] = shape
            values[name] = var
            continue
        args = decode(node['args'])
        kwargs = decode(node['kwargs'])
        if node['kind'] == 'output':
            outputs = args[0]
            continue
        if node['kind'] != 'call_function':
            raise ValueError(f'{name}: unsupported node kind {node["kind"]}')
        target = node['target']
        unary = {'torch.relu':'relu', 'torch.nn.functional.relu':'relu', 'aten.relu.default':'relu',
                 'torch.exp':'exp', 'aten.exp.default':'exp', 'torch.sqrt':'sqrt'}
        binary = {'_operator.add':'add', 'torch.add':'add', 'aten.add.Tensor':'add',
                  '_operator.mul':'mul', 'torch.mul':'mul', 'aten.mul.Tensor':'mul',
                  '_operator.sub':'sub', '_operator.truediv':'div'}
        if target == 'torch.nn.functional.batch_norm':
            # Public PyTorch functional signature: input, mean, var, weight, bias,
            # training=False, momentum=0.1, eps=1e-5. Inference only.
            fields = ['input', 'running_mean', 'running_var', 'weight', 'bias', 'training', 'momentum', 'eps']
            if len(args) > len(fields) or set(kwargs) - set(fields):
                raise ValueError(f'{name}: invalid batch_norm arguments')
            bound = dict(zip(fields, args))
            if set(bound) & set(kwargs):
                raise ValueError(f'{name}: duplicate batch_norm argument')
            bound.update(kwargs)
            if bound.get('training', 'false') != 'false':
                raise ValueError(f'{name}: training batch_norm requires statistics updates')
            source = node['args']['tuple'][0]
            if not isinstance(source, dict) or 'ref' not in source:
                raise ValueError(f'{name}: batch_norm input must reference a tensor')
            shape = metadata[source['ref']]['shape']
            if len(shape) < 2:
                raise ValueError(f'{name}: batch_norm requires a channel dimension')
            channels = [1, shape[1]] + [1] * (len(shape)-2)
            def channel(field, optional=False):
                value = bound.get(field, 'null')
                if value == 'null':
                    if optional: return None
                    raise ValueError(f'{name}: inference batch_norm requires {field}')
                source_id = next((key for key,val in values.items() if val == value), None)
                if source_id is None or metadata[source_id]['shape'] != [shape[1]]:
                    raise ValueError(f'{name}: invalid channel vector {field}')
                return f'N.reshape({value}, {json.dumps(channels)})'
            mean, variance = channel('running_mean'), channel('running_var')
            weight, bias = channel('weight', True), channel('bias', True)
            eps = bound.get('eps', '1e-5')
            epsilon = json.loads(eps)
            if not isinstance(epsilon, (int,float)) or epsilon < 0:
                raise ValueError(f'{name}: invalid epsilon')
            expr = f'N.div(N.sub({bound["input"]}, {mean}), N.sqrt(N.add({variance}, {eps})))'
            if weight: expr = f'N.mul({expr}, {weight})'
            if bias: expr = f'N.add({expr}, {bias})'
        elif target == 'torch.nn.functional.dropout':
            bound = dict(zip(['input','p','training','inplace'], args)); bound.update(kwargs)
            if bound.get('training', 'true') != 'false' or bound.get('inplace', 'false') != 'false':
                raise ValueError(f'{name}: only disabled non-inplace dropout supported')
            expr = bound['input']
        elif target in unary:
            if len(args) != 1 or any(k != 'inplace' or v != 'false' for k,v in kwargs.items()):
                raise ValueError(f'{name}: unsupported unary arguments')
            expr = f'N.{unary[target]}({args[0]})'
        elif target in binary:
            if len(args) != 2 or kwargs:
                raise ValueError(f'{name}: unsupported binary arguments')
            expr = f'N.{binary[target]}({args[0]}, {args[1]})'
        else:
            raise ValueError(f'{name}: unsupported target {target}; implement semantic lowering')
        if not isinstance(meta, dict) or meta.get('dtype') != 'torch.float32':
            raise ValueError(f'{name}: FP32 result metadata required')
        lines.append(f'const {var} = {expr};')
        values[name] = var
    if outputs is None:
        raise ValueError('Missing graph output')
    flat = []
    def flatten(v):
        if isinstance(v, (list, tuple)):
            return {'tuple' if isinstance(v, tuple) else 'list': [flatten(x) for x in v]}
        if isinstance(v, dict):
            return {'dict': {k: flatten(x) for k,x in v.items()}}
        if v not in values.values():
            raise ValueError('Only tensor node outputs supported')
        key = f'out{len(flat)}'; flat.append((key, v)); return {'output': key}
    structure = flatten(outputs)
    result = ', '.join(f'{key}: {v}' for key,v in flat)
    inputs = ', '.join(f'{key}: k.tensor({json.dumps(shape)})' for key,shape in specs.items())
    script = 'project("passnet").program(({'+', '.join(specs)+'}) => {\n'
    script += '\n'.join(lines) + '\nreturn {'+result+'};\n}, {'+inputs+'});\n'
    return {'script':script, 'inputs':specs, 'output_structure':structure}
