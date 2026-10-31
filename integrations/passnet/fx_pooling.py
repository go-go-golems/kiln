"""Static average-pooling binding; independent lowering to Kiln's pooling op."""
import json

AVG_POOL2D={'torch._C._nn.avg_pool2d','torch.nn.functional.avg_pool2d','aten.avg_pool2d.default'}

def lower_avg_pool2d(target,args,kwargs,meta,resolve,literal):
    first='self' if target.startswith('aten.') else 'input'
    fields=[first,'kernel_size','stride','padding','ceil_mode','count_include_pad','divisor_override']
    if len(args)>len(fields) or set(kwargs)-set(fields):raise ValueError('avg_pool2d: unsupported arguments')
    bound=dict(zip(fields,args))
    if set(bound)&set(kwargs):raise ValueError('avg_pool2d: duplicate argument')
    bound.update(kwargs)
    if first not in bound or 'kernel_size' not in bound:raise ValueError('avg_pool2d: input and kernel_size required')
    source=resolve(bound[first]);shape=source['shape']
    if len(shape) not in (3,4) or source['dtype'] not in ('torch.float32','torch.float16','torch.bfloat16'):
        raise ValueError('avg_pool2d: floating CHW/NCHW input required')
    options={key:literal(bound.get(key,default)) for key,default in [('kernel_size','null'),('stride','null'),('padding','0'),('ceil_mode','false'),('count_include_pad','true'),('divisor_override','null')]}
    def pair(value,name):
        if type(value) is int:return [value,value]
        if isinstance(value,(list,tuple)) and len(value) in (1,2) and all(type(x) is int for x in value):return list(value)*2 if len(value)==1 else list(value)
        raise ValueError('avg_pool2d: invalid '+name)
    kernel=pair(options['kernel_size'],'kernel_size')
    # ATen uses an empty stride list for the public None default.
    stride=pair(kernel if options['stride'] in (None,[]) else options['stride'],'stride')
    pad=pair(options['padding'],'padding')
    if any(k<=0 or s<=0 or p<0 or p>k//2 for k,s,p in zip(kernel,stride,pad)):raise ValueError('avg_pool2d: invalid kernel/stride/padding')
    if any(type(options[k]) is not bool for k in ('ceil_mode','count_include_pad')):raise ValueError('avg_pool2d: boolean flags required')
    divisor=options['divisor_override']
    if divisor is not None and (type(divisor) is not int or divisor==0):raise ValueError('avg_pool2d: nonzero integer divisor required')
    output=[]
    for size,k,s,p in zip(shape[-2:],kernel,stride,pad):
        count=(size+2*p-k+(s-1 if options['ceil_mode'] else 0))//s+1
        if options['ceil_mode'] and (count-1)*s>=size+p:count-=1
        if count<=0:raise ValueError('avg_pool2d: output must be positive')
        output.append(count)
    if meta['shape']!=shape[:-2]+output or meta['dtype']!=source['dtype']:raise ValueError('avg_pool2d: result shape/dtype mismatch')
    options.update(kernel_size=kernel,stride=stride,padding=pad)
    return f'N.avgPool2d({bound[first]}, {json.dumps(options)})'
