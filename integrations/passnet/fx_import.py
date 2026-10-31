"""Translate kiln-fx/1 into a Kiln project script with explicit coverage errors.

Independent lowering against Kiln N APIs. No upstream implementation copied.
"""
import json
from fx_indexing import lower_index,lower_transpose,lower_reshape
from fx_linalg import FUNCTIONS as LINALG_FUNCTIONS, METHODS as LINALG_METHODS, lower_linalg
from fx_norm_ops import LAYER_NORM,lower_layer_norm,SOFTMAX,lower_softmax


def import_graph(graph):
    if graph.get('format') != 'kiln-fx/1':
        raise ValueError('Expected kiln-fx/1')
    values, specs, lines, outputs = {}, {}, [], None
    fresh = set()  # Source values with fresh storage; exclusive use is checked at mutation.
    dtype_names = {'torch.float32':'f32','torch.float16':'f16','torch.bfloat16':'bf16'}
    input_dtypes = {}
    metadata = {n['id']: n.get('tensor_meta') for n in graph['nodes']}
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
            if set(v) == {'ellipsis'} and v['ellipsis'] is True:
                return Ellipsis
            if set(v) == {'slice'}:
                return slice(*(literal(decode(x)) for x in v['slice']))
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
        transpose = target in ('torch.transpose','aten.transpose.int') or (node['kind']=='call_method' and target=='transpose')
        activation = {'torch.sigmoid':'sigmoid', 'torch.nn.functional.sigmoid':'sigmoid',
                      'aten.sigmoid.default':'sigmoid', 'torch.nn.functional.silu':'silu',
                      'aten.silu.default':'silu'}.get(target)
        if node['kind']=='call_method' and target=='sigmoid': activation='sigmoid'
        linalg=LINALG_FUNCTIONS.get(target) if node['kind']=='call_function' else target if target in LINALG_METHODS else None
        inplace_binary={'_operator.iadd':'add','_operator.isub':'sub','_operator.imul':'mul','_operator.itruediv':'div'}.get(target)
        if inplace_binary:
            ref=node['args']['tuple'][0].get('ref') if len(args)==2 and isinstance(node['args']['tuple'][0],dict) else None
            if len(args)!=2 or kwargs or ref not in fresh or uses.get(ref)!=1:
                raise ValueError(f'{name}: in-place arithmetic requires fresh single-use producer')
            expr=f'N.{inplace_binary}({args[0]}, {args[1]})'
        elif linalg:
            def operand_spec(value):
                source=next((key for key,val in values.items() if val==value),None)
                if source is None or not isinstance(metadata[source],dict):raise ValueError(f'{name}: matrix operand must reference a tensor')
                return metadata[source]
            expr=lower_linalg(linalg,args,kwargs,meta,operand_spec)
        elif target in SOFTMAX or (node['kind']=='call_method' and target=='softmax'):
            def softmax_spec(value):
                source=next((key for key,val in values.items() if val==value),None)
                if source is None or not isinstance(metadata[source],dict):raise ValueError('softmax: operand must reference a tensor')
                return metadata[source]
            expr=lower_softmax('torch.softmax' if node['kind']=='call_method' else target,args,kwargs,meta,softmax_spec,literal)
        elif target in LAYER_NORM:
            def norm_spec(value):
                source=next((key for key,val in values.items() if val==value),None)
                if source is None or not isinstance(metadata[source],dict):raise ValueError('layer_norm: operand must reference a tensor')
                return metadata[source]
            expr=lower_layer_norm(target,args,kwargs,meta,norm_spec,literal)
        elif activation:
            fields=['input','inplace'] if activation=='silu' else ['input']
            if len(args)>len(fields) or set(kwargs)-set(fields):
                raise ValueError(f'{name}: unsupported {activation} arguments')
            bound=dict(zip(fields,args))
            if set(bound)&set(kwargs):raise ValueError(f'{name}: duplicate {activation} argument')
            bound.update(kwargs)
            value=bound.get('input')
            source=next((key for key,val in values.items() if val==value),None)
            inplace=bound.get('inplace','false')
            if inplace not in ('false','true'):raise ValueError(f'{name}: static Boolean inplace flag required')
            if inplace=='true' and (source not in fresh or uses.get(source)!=1):
                raise ValueError(f'{name}: inplace {activation} requires fresh single-use producer; mutation/alias lowering required otherwise')
            if source is None or not isinstance(metadata[source],dict) or metadata[source]['dtype']!=meta['dtype']:
                raise ValueError(f'{name}: {activation} requires a dtype-preserving floating tensor')
            # PyTorch pointwise activation arithmetic uses opmath FP32 for low
            # precision inputs. Narrow once at this source operation boundary.
            dtype=dtype_names[meta['dtype']]
            expr=f'N.cast(N.{activation}(N.cast({value}, "f32")), {json.dumps(dtype)})'
        elif target in ('torch.cat','torch.concat','torch.concatenate','aten.cat.default'):
            if len(args)>2 or set(kwargs)-{'tensors','dim'}:
                raise ValueError(f'{name}: unsupported concatenation arguments')
            bound=dict(zip(('tensors','dim'),args))
            if set(bound)&set(kwargs): raise ValueError(f'{name}: duplicate concatenation argument')
            bound.update(kwargs)
            tensors=bound.get('tensors')
            if not isinstance(tensors,(tuple,list)) or not tensors or any(v not in values.values() for v in tensors):
                raise ValueError(f'{name}: static nonempty tensor sequence required')
            axis=literal(bound.get('dim','0'))
            if type(axis) is not int: raise ValueError(f'{name}: static concatenation dimension required')
            dtype=dtype_names[meta['dtype']]
            casted=[]
            for value in tensors:
                source=next(key for key,v in values.items() if v==value)
                casted.append(value if metadata[source]['dtype']==meta['dtype'] else f'N.cast({value}, {json.dumps(dtype)})')
            expr=f'N.concat([{", ".join(casted)}], {axis})'
        elif target == '_operator.getitem':
            if len(args)!=2 or kwargs: raise ValueError(f'{name}: invalid indexing arguments')
            source=node['args']['tuple'][0].get('ref')
            if source not in metadata or not isinstance(metadata[source],dict):
                raise ValueError(f'{name}: basic tensor indexing requires tensor source')
            def index_literal(value):
                if isinstance(value,tuple): return tuple(index_literal(x) for x in value)
                if isinstance(value,slice) or value is Ellipsis: return value
                return literal(value)
            expr=lower_index(args[0],index_literal(args[1]),metadata[source]['shape'],meta['shape'])
        elif reduction:
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
        elif transpose:
            input_name='self' if target=='aten.transpose.int' else 'input'
            fields=[input_name,'dim0','dim1']
            if len(args)>3 or set(kwargs)-set(fields):raise ValueError(f'{name}: invalid transpose arguments')
            bound=dict(zip(fields,args))
            if set(bound)&set(kwargs):raise ValueError(f'{name}: duplicate transpose argument')
            bound.update(kwargs)
            if set(bound)!=set(fields):raise ValueError(f'{name}: transpose requires input and two dimensions')
            source=next((key for key,value in values.items() if value==bound[input_name]),None)
            if source is None:raise ValueError(f'{name}: transpose input must reference a tensor')
            expr=lower_transpose(bound[input_name],literal(bound['dim0']),literal(bound['dim1']),metadata[source],meta)
        elif target in ('torch.reshape','aten.reshape.default') or (node['kind']=='call_method' and target in ('reshape','view')):
            if node['kind']=='call_method':
                if not args or kwargs:raise ValueError(f'{name}: unsupported layout arguments')
                value=args[0]
                shape=literal(args[1]) if len(args)==2 and isinstance(args[1],(tuple,list)) else [literal(x) for x in args[1:]]
            else:
                first='self' if target=='aten.reshape.default' else 'input'
                fields=[first,'shape']
                if len(args)>2 or set(kwargs)-set(fields):raise ValueError(f'{name}: unsupported reshape arguments')
                bound=dict(zip(fields,args))
                if set(bound)&set(kwargs):raise ValueError(f'{name}: duplicate reshape argument')
                bound.update(kwargs)
                if set(bound)!=set(fields):raise ValueError(f'{name}: reshape input and shape required')
                value=bound[first];shape=literal(bound['shape'])
            source=next((key for key,val in values.items() if val==value),None)
            if source is None or not isinstance(metadata[source],dict):raise ValueError(f'{name}: reshape operand must reference a tensor')
            expr=lower_reshape(value,shape,metadata[source],meta)
        elif node['kind'] == 'call_method':
            if target=='flatten':
                if len(args)>3 or set(kwargs)-{'start_dim','end_dim'}:raise ValueError(f'{name}: invalid flatten arguments')
                bound=dict(zip(('start_dim','end_dim'),args[1:]))
                if set(bound)&set(kwargs):raise ValueError(f'{name}: duplicate flatten argument')
                bound.update(kwargs)
                if any(type(literal(v)) is not int for v in bound.values()):raise ValueError(f'{name}: static flatten axes required')
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
                if target!='torch.nn.functional.relu' or ref not in fresh or uses.get(ref)!=1:
                    raise ValueError(f'{name}: inplace operation requires fresh single-use producer')
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
        # Views, casts and disabled dropout may alias: intentionally do not
        # transfer ownership through them. Accepted in-place calls only
        # consume an already owned value whose sole use is this operation.
        if inplace_binary or linalg or activation or reduction or target in SOFTMAX or (node['kind']=='call_method' and target=='softmax') or target in LAYER_NORM or target in unary or target in binary or target in (
                'torch.conv2d','torch.nn.functional.batch_norm','torch.nn.functional.interpolate',
                'torch.cat','torch.concat','torch.concatenate','aten.cat.default'):
            fresh.add(name)
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
