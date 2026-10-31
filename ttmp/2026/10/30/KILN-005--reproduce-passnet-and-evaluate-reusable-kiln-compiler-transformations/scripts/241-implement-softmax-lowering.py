from pathlib import Path
r=Path('/home/manuel/code/wesen/kiln/worktrees/passnet')
p=r/'integrations/passnet/fx_norm_ops.py'
assert 'def lower_softmax' not in p.read_text(), 'Intermediate implementation already applied'
s=p.read_text()+'''

SOFTMAX={'torch.nn.functional.softmax','torch.softmax','aten.softmax.int','aten._softmax.default'}


def lower_softmax(target,args,kwargs,meta,resolve,literal):
    """Bind static source semantics; reuse Kiln's existing stable FP32 primitive."""
    functional=target=='torch.nn.functional.softmax'
    internal=target=='aten._softmax.default'
    first='self' if target.startswith('aten.') else 'input'
    fields=[first,'dim','_stacklevel','dtype'] if functional else [first,'dim','half_to_float' if internal else 'dtype']
    if len(args)>len(fields) or set(kwargs)-set(fields):raise ValueError('softmax: unsupported arguments')
    bound=dict(zip(fields,args))
    if set(bound)&set(kwargs):raise ValueError('softmax: duplicate argument')
    bound.update(kwargs)
    if first not in bound:raise ValueError('softmax: input required')
    value=bound[first];source=resolve(value);shape=source['shape'];rank=len(shape)
    if source['dtype'] not in DTYPES:raise ValueError('softmax: supported floating input required')
    axis=literal(bound.get('dim','null'))
    if axis is None:
        if not functional:raise ValueError('softmax: explicit dimension required')
        # PyTorch functional default, pinned in the saved semantic reference.
        axis=0 if rank in (0,1,3) else 1
    effective_rank=max(rank,1)
    if type(axis) is not int or axis < -effective_rank or axis >= effective_rank:
        raise ValueError('softmax: dimension out of range')
    axis%=effective_rank
    if '_stacklevel' in bound and type(literal(bound['_stacklevel'])) is not int:
        raise ValueError('softmax: static integer warning stacklevel required')
    dtype=source['dtype']
    if internal:
        promote=literal(bound.get('half_to_float','null'))
        if type(promote) is not bool:raise ValueError('softmax: static half_to_float required')
        if promote:
            if dtype!='torch.float16':raise ValueError('softmax: half_to_float requires float16 input')
            dtype='torch.float32'
    else:
        requested=literal(bound.get('dtype','null'))
        if requested is not None:
            if requested not in DTYPES:raise ValueError('softmax: supported floating dtype required')
            dtype=requested
    if not isinstance(meta,dict) or meta.get('shape')!=shape or meta.get('dtype')!=dtype:
        raise ValueError('softmax: result shape/dtype disagrees with source semantics')
    # Explicit dtype converts the INPUT before softmax, including narrowing.
    # Low precision then accumulates in FP32 and narrows once at the boundary.
    converted=f'N.cast({value}, {json.dumps(DTYPES[dtype])})' if dtype!=source['dtype'] else value
    fp32=f'N.cast({converted}, "f32")'
    if not rank:fp32=f'N.reshape({fp32}, [1])'
    result=f'N.softmax({fp32}, {axis})'
    if not rank:result=f'N.reshape({result}, [])'
    return f'N.cast({result}, {json.dumps(DTYPES[dtype])})'
'''
p.write_text(s)
p=r/'integrations/passnet/fx_import.py';s=p.read_text().replace('from fx_norm_ops import LAYER_NORM,lower_layer_norm','from fx_norm_ops import LAYER_NORM,lower_layer_norm,SOFTMAX,lower_softmax')
anchor='        elif target in LAYER_NORM:\n'
insert='''        elif target in SOFTMAX or (node['kind']=='call_method' and target=='softmax'):
            def softmax_spec(value):
                source=next((key for key,val in values.items() if val==value),None)
                if source is None or not isinstance(metadata[source],dict):raise ValueError('softmax: operand must reference a tensor')
                return metadata[source]
            expr=lower_softmax('torch.softmax' if node['kind']=='call_method' else target,args,kwargs,meta,softmax_spec,literal)
'''
assert anchor in s;s=s.replace(anchor,insert+anchor);p.write_text(s)
