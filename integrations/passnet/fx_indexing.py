"""Static basic tensor indexing lowered to Kiln slices and reshape.

Independent value-semantic lowering; advanced indexing and strided/empty slices
require additional compiler support. No PyTorch implementation copied.
"""
import json

SINGLETON_FUNCTIONS = {
    'torch.unsqueeze', 'aten.unsqueeze.default', 'torch.squeeze',
    'aten.squeeze.default', 'aten.squeeze.dim', 'aten.squeeze.dims',
}
SINGLETON_METHODS = {'unsqueeze', 'squeeze'}


def lower_singleton_view(target,args,kwargs,output,resolve,literal):
    """Insert/remove singleton axes without granting fresh-storage ownership."""
    operation='unsqueeze' if 'unsqueeze' in target else 'squeeze'
    first='self' if target.startswith('aten.') or target in SINGLETON_METHODS else 'input'
    no_dim=target=='aten.squeeze.default'
    fields=[first] if no_dim else [first,'dim']
    if len(args)>len(fields) or set(kwargs)-set(fields):
        raise ValueError(f'{operation}: unsupported arguments')
    bound=dict(zip(fields,args))
    if set(bound)&set(kwargs):raise ValueError(f'{operation}: duplicate argument')
    bound.update(kwargs)
    if first not in bound:raise ValueError(f'{operation}: input required')
    source=resolve(bound[first]);shape=source['shape'];rank=len(shape)
    if operation=='unsqueeze':
        if 'dim' not in bound:raise ValueError('unsqueeze: dimension required')
        axis=literal(bound['dim'])
        if type(axis) is not int or not -rank-1<=axis<=rank:
            raise ValueError('unsqueeze: static integer dimension out of range')
        axis%=rank+1
        expected=shape[:axis]+[1]+shape[axis:]
    else:
        if 'dim' not in bound:
            if target in ('aten.squeeze.dim','aten.squeeze.dims'):
                raise ValueError('squeeze: dimension required by ATen overload')
            axes=list(range(rank))
        else:
            dims=literal(bound['dim'])
            if target=='aten.squeeze.dim' and type(dims) is not int:
                raise ValueError('squeeze: ATen dim overload requires one integer')
            if target=='aten.squeeze.dims' and not isinstance(dims,list):
                raise ValueError('squeeze: ATen dims overload requires integer list')
            dims=[dims] if type(dims) is int else dims
            effective_rank=max(1,rank)
            if not isinstance(dims,list) or any(type(d) is not int or not -effective_rank<=d<effective_rank for d in dims):
                raise ValueError('squeeze: static integer dimensions out of range')
            axes=[d%effective_rank for d in dims]
            if len(set(axes))!=len(axes):raise ValueError('squeeze: duplicate dimensions')
        expected=[size for axis,size in enumerate(shape) if size!=1 or axis not in axes]
    return lower_reshape(bound[first],expected,source,output)


def lower_transpose(value, dim0, dim1, source, output):
    """One value-semantic binding for method, torch and ATen transpose."""
    if not isinstance(source,dict) or not isinstance(output,dict) or source.get('dtype')!=output.get('dtype'):
        raise ValueError('transpose: dtype-preserving tensor metadata required')
    shape=source['shape'];rank=len(shape);effective_rank=max(1,rank)
    if any(type(axis) is not int or axis < -effective_rank or axis >= effective_rank for axis in [dim0,dim1]):
        raise ValueError('transpose: invalid transpose dimensions')
    axes=[axis+effective_rank if axis<0 else axis for axis in [dim0,dim1]]
    expected=list(shape)
    if rank:expected[axes[0]],expected[axes[1]]=expected[axes[1]],expected[axes[0]]
    if output['shape']!=expected:raise ValueError('transpose: output shape disagrees with axis exchange')
    if not rank:return f'N.reshape({value}, [])'
    return f'N.transpose({value}, {axes[0]}, {axes[1]})'


def lower_index(value, key, shape, output_shape):
    keys = list(key) if isinstance(key, tuple) else [key]
    if sum(k is Ellipsis for k in keys) > 1:
        raise ValueError('Only one ellipsis allowed')
    consumed = sum(k is not None and k is not Ellipsis for k in keys)
    if consumed > len(shape):
        raise ValueError('Too many tensor indices')
    expanded = []
    for item in keys:
        if item is Ellipsis:
            expanded.extend([slice(None)] * (len(shape)-consumed))
        else:
            expanded.append(item)
    if not any(k is Ellipsis for k in keys):
        expanded.extend([slice(None)] * (len(shape)-consumed))
    axis = 0
    result_shape = []
    expression = value
    for item in expanded:
        if item is None:
            result_shape.append(1)
            continue
        size = shape[axis]
        if type(item) is int:
            index = item + size if item < 0 else item
            if index < 0 or index >= size:
                raise ValueError('Tensor index out of range')
            expression = f'N.slice({expression}, {axis}, {index}, {index+1})'
        elif isinstance(item, slice):
            if any(v is not None and type(v) is not int for v in (item.start,item.stop,item.step)):
                raise ValueError('Static integer slice bounds required')
            start, stop, step = item.indices(size)
            if step != 1:
                raise ValueError('Strided tensor slices require compiler lowering')
            if stop <= start:
                raise ValueError('Empty tensor slices require zero-size support')
            if start != 0 or stop != size:
                expression = f'N.slice({expression}, {axis}, {start}, {stop})'
            result_shape.append(stop-start)
        else:
            raise ValueError('Advanced or dynamic tensor indexing unsupported')
        axis += 1
    if result_shape != output_shape:
        raise ValueError('Index output metadata disagrees with static indexing')
    # Integer selections preserve unit axes during slicing; reshape removes them
    # and inserts None axes without changing flattened logical order.
    return f'N.reshape({expression}, {json.dumps(result_shape)})'


def lower_reshape(value,shape,source,output):
    """Resolve positive static sizes and one inferred axis against source metadata."""
    import math
    if not isinstance(shape,(tuple,list)) or any(type(d) is not int or d==0 or d < -1 for d in shape):
        raise ValueError('reshape: positive static dimensions or one -1 required')
    if shape.count(-1)>1:raise ValueError('reshape: only one inferred dimension allowed')
    elements=math.prod(source['shape']);resolved=list(shape)
    if -1 in resolved:
        known=math.prod(d for d in resolved if d!=-1)
        if elements%known:raise ValueError('reshape: inferred dimension must divide element count')
        resolved[resolved.index(-1)]=elements//known
    if math.prod(resolved)!=elements:raise ValueError('reshape: element count must be preserved')
    if not isinstance(output,dict) or source['dtype']!=output.get('dtype') or resolved!=output.get('shape'):
        raise ValueError('reshape: result shape/dtype disagrees with static semantics')
    return f'N.reshape({value}, {json.dumps(resolved)})'

FLATTEN_FUNCTIONS={'torch.flatten','aten.flatten.using_ints'}

def lower_flatten(target,args,kwargs,output,resolve,literal):
    """Share functional/method flatten semantics; preserve conservative view ownership."""
    import math
    first='self' if target=='flatten' or target.startswith('aten.') else 'input'
    fields=[first,'start_dim','end_dim']
    if len(args)>3 or set(kwargs)-set(fields):raise ValueError('flatten: unsupported arguments')
    bound=dict(zip(fields,args))
    if set(bound)&set(kwargs):raise ValueError('flatten: duplicate argument')
    bound.update(kwargs)
    if first not in bound:raise ValueError('flatten: input required')
    source=resolve(bound[first]);shape=source['shape'];rank=max(1,len(shape))
    axes=[literal(bound.get('start_dim','0')),literal(bound.get('end_dim','-1'))]
    if any(type(axis) is not int or not -rank<=axis<rank for axis in axes):raise ValueError('flatten: invalid static axes')
    start,end=[axis%rank for axis in axes]
    if start>end:raise ValueError('flatten: start_dim must not exceed end_dim')
    expected=shape[:start]+[math.prod(shape[start:end+1])]+shape[end+1:] if shape else [1]
    return lower_reshape(bound[first],expected,source,output)
