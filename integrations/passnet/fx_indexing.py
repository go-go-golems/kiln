"""Static basic tensor indexing lowered to Kiln slices and reshape.

Independent value-semantic lowering; advanced indexing and strided/empty slices
require additional compiler support. No PyTorch implementation copied.
"""
import json


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
