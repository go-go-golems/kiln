"""Static basic tensor indexing lowered to Kiln slices and reshape.

Independent value-semantic lowering; advanced indexing and strided/empty slices
require additional compiler support. No PyTorch implementation copied.
"""
import json


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
