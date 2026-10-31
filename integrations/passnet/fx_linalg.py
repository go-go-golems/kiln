"""Independent PyTorch linear/matrix shape and arithmetic-boundary lowering."""
import json

FUNCTIONS={'torch._C._nn.linear':'linear','torch.nn.functional.linear':'linear','aten.linear.default':'linear',
           'torch.matmul':'matmul','_operator.matmul':'matmul','aten.matmul.default':'matmul',
           'torch.mm':'mm','aten.mm.default':'mm','torch.bmm':'bmm','aten.bmm.default':'bmm'}
METHODS={'matmul','mm','bmm'}
from fx_ops import DTYPES


def matmul_shape(a,b):
    if not a or not b:raise ValueError('matmul requires nonscalar operands')
    av=len(a)==1;bv=len(b)==1
    aa=[1,*a] if av else a;bb=[*b,1] if bv else b
    if aa[-1]!=bb[-2]:raise ValueError('matmul contraction dimensions differ')
    left=aa[:-2];right=bb[:-2];rank=max(len(left),len(right))
    left=[1]*(rank-len(left))+left;right=[1]*(rank-len(right))+right
    if any(x!=y and x!=1 and y!=1 for x,y in zip(left,right)):raise ValueError('matmul batch dimensions cannot broadcast')
    return [max(x,y) for x,y in zip(left,right)]+([] if av else [aa[-2]])+([] if bv else [bb[-1]])


def lower_linalg(kind,args,kwargs,meta,resolve):
    fields=['input','weight','bias'] if kind=='linear' else ['input','other' if kind=='matmul' else 'mat2']
    if len(args)>len(fields) or set(kwargs)-set(fields):raise ValueError(f'{kind}: unsupported arguments, including output mutation')
    bound=dict(zip(fields,args))
    if set(bound)&set(kwargs):raise ValueError(f'{kind}: duplicate argument')
    bound.update(kwargs)
    if any(key not in bound for key in fields[:2]):raise ValueError(f'{kind}: two tensor operands required')
    x,w=bound[fields[0]],bound[fields[1]];xs,ws=resolve(x),resolve(w)
    if xs['dtype'] not in DTYPES or xs['dtype']!=ws['dtype']:raise ValueError(f'{kind}: matching floating operand dtypes required')
    a,b=xs['shape'],ws['shape']
    bias=bound.get('bias','null')
    if kind=='linear':
        if not a or len(b) not in (1,2) or a[-1]!=b[-1]:raise ValueError('linear: input/weight contraction or rank mismatch')
        shape=a[:-1]+([] if len(b)==1 else [b[0]])
        if bias!='null':
            bs=resolve(bias)
            if bs['dtype']!=xs['dtype']:raise ValueError('linear: bias dtype differs')
            dims=bs['shape']
            if len(dims)>len(shape) or any(v!=1 and v!=shape[len(shape)-len(dims)+i] for i,v in enumerate(dims)):
                raise ValueError('linear: bias cannot broadcast to output')
        expression=f'N.linear(N.cast({x}, "f32"), N.cast({w}, "f32"), '+('null' if bias=='null' else f'N.cast({bias}, "f32")')+')'
    else:
        if kind=='mm' and (len(a)!=2 or len(b)!=2):raise ValueError('mm: rank-two operands required')
        if kind=='bmm' and (len(a)!=3 or len(b)!=3 or a[0]!=b[0]):raise ValueError('bmm: equal rank-three batches required')
        shape=matmul_shape(a,b)
        expression=f'N.matmul(N.cast({x}, "f32"), N.cast({w}, "f32"))'
    if meta['dtype']!=xs['dtype'] or meta['shape']!=shape:raise ValueError(f'{kind}: result metadata differs from source semantics')
    return f'N.cast({expression}, {json.dumps(DTYPES[xs["dtype"]])})'
