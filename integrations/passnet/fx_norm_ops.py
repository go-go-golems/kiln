"""Bind source normalization operators to existing Kiln reduction programs."""
import json
import math

LAYER_NORM={'torch.nn.functional.layer_norm','torch.layer_norm','aten.layer_norm.default'}
from dtypes import FLOATING


def lower_layer_norm(target,args,kwargs,meta,resolve,literal):
    fields=['input','normalized_shape','weight','bias','eps']
    if target!='torch.nn.functional.layer_norm':fields.append('cudnn_enable')
    if len(args)>len(fields) or set(kwargs)-set(fields):raise ValueError('layer_norm: unsupported arguments')
    bound=dict(zip(fields,args))
    if set(bound)&set(kwargs):raise ValueError('layer_norm: duplicate argument')
    bound.update(kwargs)
    if 'input' not in bound or 'normalized_shape' not in bound:raise ValueError('layer_norm: input and normalized_shape required')
    source=resolve(bound['input']);shape=source['shape'];normalized=literal(bound['normalized_shape'])
    if type(normalized) is int:normalized=[normalized]
    if not isinstance(normalized,list) or not normalized or any(type(d) is not int or d<=0 for d in normalized):
        raise ValueError('layer_norm: positive static normalized_shape required')
    if len(normalized)>len(shape) or shape[-len(normalized):]!=normalized:
        raise ValueError('layer_norm: normalized_shape must equal trailing input dimensions')
    if source['dtype'] not in FLOATING or meta['dtype']!=source['dtype'] or meta['shape']!=shape:
        raise ValueError('layer_norm: result shape/dtype differs from input')
    eps=literal(bound.get('eps','1e-5'))
    if type(eps) not in (int,float) or not math.isfinite(eps) or eps<0:raise ValueError('layer_norm: finite nonnegative epsilon required')
    if bound.get('cudnn_enable','true') not in ('true','false'):raise ValueError('layer_norm: static backend hint required')
    width=math.prod(normalized);rows=math.prod(shape)//width
    def affine(name,identity):
        value=bound.get(name,'null')
        if value=='null':return f'N.const({identity}, [{width}])'
        tensor=resolve(value)
        if tensor['shape']!=normalized or tensor['dtype']!=source['dtype']:
            raise ValueError(f'layer_norm: {name} requires matching shape/dtype; mixed parameter precision is unsupported')
        return f'N.reshape(N.cast({value}, "f32"), [{width}])'
    value=f'N.reshape(N.cast({bound["input"]}, "f32"), [{rows}, {width}])'
    expression=f'N.layer_norm({value}, {affine("weight",1)}, {affine("bias",0)}, '+json.dumps({'eps':eps})+')'
    return f'N.cast(N.reshape({expression}, {json.dumps(shape)}), {json.dumps(FLOATING[source["dtype"]])})'


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
    if source['dtype'] not in FLOATING:raise ValueError('softmax: supported floating input required')
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
            if requested not in FLOATING:raise ValueError('softmax: supported floating dtype required')
            dtype=requested
    if not isinstance(meta,dict) or meta.get('shape')!=shape or meta.get('dtype')!=dtype:
        raise ValueError('softmax: result shape/dtype disagrees with source semantics')
    # Explicit dtype converts the INPUT before softmax, including narrowing.
    # Low precision then accumulates in FP32 and narrows once at the boundary.
    converted=f'N.cast({value}, {json.dumps(FLOATING[dtype])})' if dtype!=source['dtype'] else value
    fp32=f'N.cast({converted}, "f32")'
    if not rank:fp32=f'N.reshape({fp32}, [1])'
    result=f'N.softmax({fp32}, {axis})'
    if not rank:result=f'N.reshape({result}, [])'
    return f'N.cast({result}, {json.dumps(FLOATING[dtype])})'
