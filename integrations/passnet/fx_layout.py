"""Independent static pad/roll and partition bindings; partition outputs alias input."""
import json
import math

PAD={'torch.nn.functional.pad','aten.pad.default','aten.constant_pad_nd.default'}
ROLL={'torch.roll','aten.roll.default'}
PARTITION={'torch.functional.split','torch.split','torch.chunk','aten.split.Tensor','aten.split_with_sizes.default','aten.chunk.default'}
PARTITION_METHODS={'split','chunk'}

def bind(target,args,kwargs,fields):
    if len(args)>len(fields) or set(kwargs)-set(fields):raise ValueError(target+': unsupported arguments')
    bound=dict(zip(fields,args))
    if set(bound)&set(kwargs):raise ValueError(target+': duplicate argument')
    bound.update(kwargs)
    if fields[0] not in bound:raise ValueError(target+': input required')
    return bound

def lower_pad(target,args,kwargs,meta,resolve,literal):
    first='self' if target.startswith('aten.') else 'input'
    constant=target=='aten.constant_pad_nd.default'
    b=bind(target,args,kwargs,[first,'pad','value'] if constant else [first,'pad','mode','value'])
    if 'pad' not in b:raise ValueError('pad: padding required')
    source=resolve(b[first]);shape=source['shape'];pad=literal(b['pad'])
    mode='constant' if constant else literal(b.get('mode','"constant"'))
    value=literal(b.get('value','0'));value=0 if value is None else value
    if not isinstance(pad,list) or len(pad)%2 or len(pad)>2*len(shape) or any(type(p) is not int for p in pad):raise ValueError('pad: static integer pairs required')
    if mode not in ('constant','reflect','replicate','circular'):raise ValueError('pad: unsupported mode')
    if type(value) not in (int,float) or not math.isfinite(value):raise ValueError('pad: finite scalar value required')
    count=len(pad)//2
    if mode!='constant' and (count not in (1,2,3) or len(shape) not in (count+1,count+2) or value!=0):raise ValueError('pad: unsupported spatial rank or nonconstant value')
    expected=shape.copy()
    for i in range(count):
        axis=len(shape)-1-i;n=shape[axis];left,right=pad[2*i:2*i+2];expected[axis]+=left+right
        if expected[axis]<=0:raise ValueError('pad: positive output required')
        if mode=='reflect' and (left>=n or right>=n):raise ValueError('pad: reflection exceeds input')
        if mode=='constant' and n+min(0,left)+min(0,right)<0:raise ValueError('pad: crop exceeds input')
        if mode=='circular' and (left>n+min(0,right) or right>n+min(0,left) or n+min(0,left)+min(0,right)<=0):raise ValueError('pad: circular wrap/crop invalid')
    if meta['shape']!=expected or meta['dtype']!=source['dtype']:raise ValueError('pad: output shape/dtype mismatch')
    return f'N.pad({b[first]}, {json.dumps(pad)}, {json.dumps(mode)}, {json.dumps(value)})'

def lower_roll(target,args,kwargs,meta,resolve,literal):
    first='self' if target.startswith('aten.') or target=='roll' else 'input'
    b=bind(target,args,kwargs,[first,'shifts','dims'])
    if 'shifts' not in b:raise ValueError('roll: shifts required')
    source=resolve(b[first]);shape=source['shape'];shifts=literal(b['shifts']);dims=literal(b.get('dims','null'))
    shifts=[shifts] if type(shifts) is int else shifts;dims=[dims] if type(dims) is int else dims
    flatten=dims is None or dims==[];rank=1 if flatten else len(shape)
    if flatten:dims=[0]
    if not isinstance(shifts,list) or not shifts or any(type(s) is not int for s in shifts) or not isinstance(dims,list) or len(dims)!=len(shifts) or any(type(d) is not int or not -rank<=d<rank for d in dims):raise ValueError('roll: matching static shifts/dimensions required')
    if meta['shape']!=shape or meta['dtype']!=source['dtype']:raise ValueError('roll: output shape/dtype mismatch')
    return f'N.roll({b[first]}, {json.dumps(shifts)}, {json.dumps(None if flatten else dims)})'

def lower_partition(target,args,kwargs,meta,resolve,literal):
    """Return slice expression list; caller must preserve list metadata and aliasing."""
    first='self' if target.startswith('aten.') or target in PARTITION_METHODS else 'tensor' if target in ('torch.split','torch.functional.split') else 'input'
    chunk='chunk' in target
    second='chunks' if chunk else 'split_sizes' if target=='aten.split_with_sizes.default' else 'split_size' if target=='aten.split.Tensor' or target=='split' else 'split_size_or_sections'
    b=bind(target,args,kwargs,[first,second,'dim'])
    if second not in b:raise ValueError('partition: sizes required')
    source=resolve(b[first]);shape=source['shape'];axis=literal(b.get('dim','0'));sizes=literal(b[second])
    if type(axis) is not int or not -len(shape)<=axis<len(shape):raise ValueError('partition: invalid dimension')
    axis%=len(shape);n=shape[axis]
    if type(sizes) is int:
        if sizes<=0:raise ValueError('partition: positive size/chunks required')
        width=(n+sizes-1)//sizes if chunk else sizes
        sizes=[min(width,n-start) for start in range(0,n,width)]
    elif chunk or not isinstance(sizes,list) or any(type(s) is not int or s<=0 for s in sizes) or sum(sizes)!=n:raise ValueError('partition: positive exact static sections required')
    if not isinstance(meta,(list,tuple)) or len(meta)!=len(sizes):raise ValueError('partition: output count mismatch')
    result=[];start=0
    for size,out in zip(sizes,meta):
        expected=shape.copy();expected[axis]=size
        if not isinstance(out,dict) or out['shape']!=expected or out['dtype']!=source['dtype']:raise ValueError('partition: output shape/dtype mismatch')
        result.append(f'N.slice({b[first]}, {axis}, {start}, {start+size})');start+=size
    return result
