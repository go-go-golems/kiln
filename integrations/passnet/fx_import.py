"""Translate kiln-fx/1 into a Kiln project script with explicit coverage errors.

Independent lowering against Kiln N APIs. No upstream implementation copied.
"""
import json


def import_graph(graph):
    if graph.get('format') != 'kiln-fx/1':
        raise ValueError('Expected kiln-fx/1')
    values, specs, lines, outputs = {}, {}, [], None
    dtype_names = {'torch.float32':'f32','torch.float16':'f16','torch.bfloat16':'bf16'}
    input_dtypes = {}
    metadata = {n['id']: n.get('tensor_meta') for n in graph['nodes']}
    nodes_by_id = {n['id']: n for n in graph['nodes']}
    uses = {}
    def references(value):
        if isinstance(value,dict):
            if set(value)=={'ref'}: uses[value['ref']]=uses.get(value['ref'],0)+1
            else:
                for item in value.values(): references(item)
        elif isinstance(value,list):
            for item in value: references(item)
    for node in graph['nodes']:
        references(node['args']);references(node['kwargs'])
    def literal(value):
        if isinstance(value,(tuple,list)): return [literal(x) for x in value]
        return json.loads(value)

    def decode(v):
        if isinstance(v, dict):
            if set(v) == {'dtype'}:
                return json.dumps(v['dtype'])
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
            if not isinstance(meta, dict) or meta.get('dtype') not in dtype_names:
                raise ValueError(f'{name}: only supported floating tensor inputs accepted')
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
            input_dtypes[var] = dtype_names[meta['dtype']]
            values[name] = var
            continue
        args = decode(node['args'])
        kwargs = decode(node['kwargs'])
        if node['kind'] == 'output':
            outputs = args[0]
            continue
        if node['kind'] not in ('call_function', 'call_method'):
            raise ValueError(f'{name}: unsupported node kind {node["kind"]}')
        target = node['target']
        unary = {'torch.relu':'relu', 'torch.nn.functional.relu':'relu', 'aten.relu.default':'relu',
                 'torch.exp':'exp', 'aten.exp.default':'exp', 'torch.sqrt':'sqrt'}
        binary = {'_operator.add':'add', 'torch.add':'add', 'aten.add.Tensor':'add',
                  '_operator.mul':'mul', 'torch.mul':'mul', 'aten.mul.Tensor':'mul',
                  '_operator.sub':'sub', '_operator.truediv':'div'}
        reduction = target in ('torch.sum','torch.mean','aten.sum.dim_IntList','aten.mean.dim') or (node['kind']=='call_method' and target in ('sum','mean'))
        if reduction:
            fields=['input','dim','keepdim']
            if len(args)>3 or set(kwargs)-{'dim','keepdim'}:
                raise ValueError(f'{name}: unsupported reduction arguments')
            bound=dict(zip(fields,args))
            if set(bound)&set(kwargs): raise ValueError(f'{name}: duplicate reduction argument')
            bound.update(kwargs)
            source=node['args']['tuple'][0]['ref']
            shape=metadata[source]['shape'];rank=len(shape)
            dims=literal(bound.get('dim','null'))
            dims=list(range(rank)) if dims is None or dims==[] else [dims] if isinstance(dims,int) else dims
            if not isinstance(dims,list) or any(type(d) is not int or d < -rank or d>=rank for d in dims):
                raise ValueError(f'{name}: invalid reduction axes')
            axes=[d+rank if d<0 else d for d in dims]
            if len(set(axes))!=len(axes): raise ValueError(f'{name}: duplicate reduction axes')
            keep=literal(bound.get('keepdim','false'))
            if type(keep) is not bool: raise ValueError(f'{name}: keepdim must be Boolean')
            expr=f'N.cast({bound["input"]}, "f32")'
            for axis in sorted(axes): expr=f'N.sum({expr}, {axis}, true)'
            if 'mean' in target:
                count=1
                for axis in axes: count*=shape[axis]
                expr=f'N.mul({expr}, {1/count!r})'
            if not keep:
                output_shape=[dim for axis,dim in enumerate(shape) if axis not in axes]
                expr=f'N.reshape({expr}, {json.dumps(output_shape)})'
            expr=f'N.cast({expr}, {json.dumps(dtype_names[meta["dtype"]])})'
        elif node['kind'] == 'call_method':
            if target == 'transpose':
                if len(args)!=3 or kwargs: raise ValueError(f'{name}: invalid transpose arguments')
                dims=[literal(value) for value in args[1:]]
                rank=len(metadata[node['args']['tuple'][0]['ref']]['shape'])
                if any(type(d) is not int or d < -rank or d>=rank for d in dims):
                    raise ValueError(f'{name}: invalid transpose dimensions')
                expr=f'N.transpose({args[0]}, {dims[0]}, {dims[1]})'
            elif target in ('reshape','view','flatten'):
                if kwargs and (target!='flatten' or set(kwargs)-{'start_dim','end_dim'}):
                    raise ValueError(f'{name}: unsupported layout keyword arguments')
                if target in ('reshape','view'):
                    shape_args=literal(args[1]) if len(args)==2 and isinstance(args[1],(tuple,list)) else [literal(x) for x in args[1:]]
                    if any(type(d) is not int for d in shape_args):
                        raise ValueError(f'{name}: static integer shape required')
                else:
                    if len(args)>3: raise ValueError(f'{name}: invalid flatten arguments')
                    bound=dict(zip(('start_dim','end_dim'),args[1:]))
                    if set(bound)&set(kwargs): raise ValueError(f'{name}: duplicate flatten argument')
                    bound.update(kwargs)
                    if any(type(literal(d)) is not int for d in bound.values()):
                        raise ValueError(f'{name}: static flatten axes required')
                expr=f'N.reshape({args[0]}, {json.dumps(meta["shape"])})'
            elif target == 'contiguous':
                if len(args)!=1 or kwargs: raise ValueError(f'{name}: unsupported contiguous format')
                expr=f'N.reshape({args[0]}, {json.dumps(meta["shape"])})'
            elif target == 'permute':
                if kwargs: raise ValueError(f'{name}: unsupported permutation keywords')
                dims=literal(args[1]) if len(args)==2 and isinstance(args[1],(tuple,list)) else [literal(x) for x in args[1:]]
                rank=len(metadata[node['args']['tuple'][0]['ref']]['shape'])
                if len(dims)!=rank or any(type(d) is not int for d in dims):
                    raise ValueError(f'{name}: permutation must specify every axis')
                dims=[d+rank if d<0 else d for d in dims]
                if sorted(dims)!=list(range(rank)): raise ValueError(f'{name}: invalid permutation')
                current=list(range(rank));expr=args[0]
                for axis,wanted in enumerate(dims):
                    other=current.index(wanted)
                    if other!=axis:
                        expr=f'N.transpose({expr}, {axis}, {other})'
                        current[axis],current[other]=current[other],current[axis]
            elif target in ('to','float','half','bfloat16'):
                if target=='to':
                    if len(args)>2 or set(kwargs)-{'dtype'}: raise ValueError(f'{name}: device/layout conversion unsupported')
                    if (len(args)==2)==('dtype' in kwargs):
                        raise ValueError(f'{name}: exactly one explicit dtype required')
                    dtype=literal(args[1] if len(args)==2 else kwargs['dtype'])
                    if dtype not in dtype_names: raise ValueError(f'{name}: unsupported cast dtype {dtype}')
                    dtype=dtype_names[dtype]
                else:
                    if len(args)!=1 or kwargs: raise ValueError(f'{name}: invalid floating conversion')
                    dtype={'float':'f32','half':'f16','bfloat16':'bf16'}[target]
                expr=f'N.cast({args[0]}, {json.dumps(dtype)})'
            else:
                raise ValueError(f'{name}: unsupported tensor method {target}')
        elif target == 'torch.conv2d':
            fields=['input','weight','bias','stride','padding','dilation','groups']
            if len(args)>7 or set(kwargs)-set(fields): raise ValueError(f'{name}: unsupported conv2d arguments')
            bound=dict(zip(fields,args))
            if set(bound)&set(kwargs): raise ValueError(f'{name}: duplicate conv2d argument')
            bound.update(kwargs)
            options={key:literal(bound.get(key,default)) for key,default in [('stride','1'),('padding','0'),('dilation','1'),('groups','1')]}
            expr=f'N.conv2d({bound["input"]}, {bound["weight"]}, {bound.get("bias","null")}, {json.dumps(options)})'
        elif target == 'torch.nn.functional.interpolate':
            if meta.get('dtype') not in dtype_names or len(args)!=1:
                raise ValueError(f'{name}: interpolation requires supported floating dtype and explicit keyword options')
            if set(kwargs)-{'size','scale_factor','mode','align_corners','recompute_scale_factor','antialias'}:
                raise ValueError(f'{name}: unsupported interpolation arguments')
            if kwargs.get('mode')!='"bilinear"' or kwargs.get('align_corners')!='false' or kwargs.get('scale_factor','null')!='null' or kwargs.get('antialias','false')!='false' or kwargs.get('recompute_scale_factor','null') not in ('null','false'):
                raise ValueError(f'{name}: only explicit-size bilinear align_corners=False supported')
            size=literal(kwargs['size'])
            expr=f'N.resizeBilinear({args[0]}, {json.dumps(size)})'
        elif target == 'torch.nn.functional.batch_norm':
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
                return f'N.reshape(N.cast({value}, "f32"), {json.dumps(channels)})'
            mean, variance = channel('running_mean'), channel('running_var')
            weight, bias = channel('weight', True), channel('bias', True)
            eps = bound.get('eps', '1e-5')
            epsilon = json.loads(eps)
            if not isinstance(epsilon, (int,float)) or epsilon < 0:
                raise ValueError(f'{name}: invalid epsilon')
            expr = f'N.div(N.sub(N.cast({bound["input"]}, "f32"), {mean}), N.sqrt(N.add({variance}, {eps})))'
            if weight: expr = f'N.mul({expr}, {weight})'
            if bias: expr = f'N.add({expr}, {bias})'
            expr = f'N.cast({expr}, {json.dumps(dtype_names[meta["dtype"]])})'
        elif target == 'torch.nn.functional.dropout':
            bound = dict(zip(['input','p','training','inplace'], args)); bound.update(kwargs)
            if bound.get('training', 'true') != 'false' or bound.get('inplace', 'false') != 'false':
                raise ValueError(f'{name}: only disabled non-inplace dropout supported')
            expr = bound['input']
        elif target in unary:
            if kwargs.get('inplace') == 'true':
                ref=node['args']['tuple'][0].get('ref')
                producer=nodes_by_id.get(ref,{})
                if target!='torch.nn.functional.relu' or producer.get('target')!='torch.conv2d' or uses.get(ref)!=1:
                    raise ValueError(f'{name}: inplace operation requires fresh single-use convolution output')
                kwargs={k:v for k,v in kwargs.items() if k!='inplace'}
            if len(args) != 1 or any(k != 'inplace' or v != 'false' for k,v in kwargs.items()):
                raise ValueError(f'{name}: unsupported unary arguments')
            expr = f'N.{unary[target]}({args[0]})'
        elif target in binary:
            if len(args) != 2 or kwargs:
                raise ValueError(f'{name}: unsupported binary arguments')
            expr = f'N.{binary[target]}({args[0]}, {args[1]})'
        else:
            raise ValueError(f'{name}: unsupported target {target}; implement semantic lowering')
        if not isinstance(meta, dict) or meta.get('dtype') not in dtype_names:
            raise ValueError(f'{name}: supported floating result metadata required')
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
    inputs = ', '.join(f'{key}: k.tensor({json.dumps(shape)}, {json.dumps(input_dtypes[key])})' for key,shape in specs.items())
    script = 'project("passnet").program(({'+', '.join(specs)+'}) => {\n'
    script += '\n'.join(lines) + '\nreturn {'+result+'};\n}, {'+inputs+'});\n'
    return {'script':script, 'inputs':specs, 'input_dtypes':input_dtypes, 'output_structure':structure}
