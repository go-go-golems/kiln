"""CPU oracle fixtures from installed PyTorch; semantic sources pinned separately."""
import itertools,json,math
from pathlib import Path
import torch
root=Path.cwd()
cases=[]
for shape,kernel,stride,padding,dilation,ceil in itertools.product([[2,5,6],[1,2,4,5]],[2,[3,2]],[None,[2,3]],[0,1],[1,2],[False,True]):
    options=dict(kernel_size=kernel,stride=stride,padding=padding,dilation=dilation,ceil_mode=ceil)
    x=(torch.arange(math.prod(shape),dtype=torch.float32)%29-30).reshape(shape)/7
    try:y=torch.nn.functional.max_pool2d(x,**options)
    except RuntimeError:continue
    cases.append(dict(input=dict(shape=shape,data=x.flatten().tolist(),dtype='f32'),options=options,output=dict(shape=list(y.shape),data=y.flatten().tolist())))
for dtype,name in [(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
    for base in cases[:8]:
        x=torch.tensor(base['input']['data'],dtype=dtype).reshape(base['input']['shape']);y=torch.nn.functional.max_pool2d(x,**base['options'])
        cases.append(dict(input=dict(shape=list(x.shape),data=x.float().flatten().tolist(),dtype=name),options=base['options'],output=dict(shape=list(y.shape),data=y.float().flatten().tolist())))
(root/'packages/kiln/test/fixtures/max-pool2d-pytorch.json').write_text(json.dumps(dict(torch_version=torch.__version__,cases=cases),indent=2)+'\n')
print(len(cases))
