"""Bind source normalization operators to existing Kiln reduction programs."""
import json
import math

LAYER_NORM={'torch.nn.functional.layer_norm','torch.layer_norm','aten.layer_norm.default'}
DTYPES={'torch.float32':'f32','torch.float16':'f16','torch.bfloat16':'bf16'}


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
    if source['dtype'] not in DTYPES or meta['dtype']!=source['dtype'] or meta['shape']!=shape:
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
    return f'N.cast(N.reshape({expression}, {json.dumps(shape)}), {json.dumps(DTYPES[source["dtype"]])})'
