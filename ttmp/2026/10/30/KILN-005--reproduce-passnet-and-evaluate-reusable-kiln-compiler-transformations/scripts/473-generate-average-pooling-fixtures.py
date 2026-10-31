"""Independent PyTorch oracle fixtures, including explicit/ceil padding divisors."""
import itertools,json
from pathlib import Path
import torch
T=Path(__file__).resolve().parent.parent
cases=[]
for shape,kernel,stride,padding,ceil,include,divisor in itertools.product(
 [(2,5,7),(1,2,4,6)],[(3,2),(2,3)],[None,(2,2),(3,4)],[(0,0),(1,1)],[False,True],[False,True],[None,7,-3]):
 x=(torch.arange(torch.tensor(shape).prod()).reshape(shape).float()%17-8)/4
 options=dict(kernel_size=kernel,stride=stride,padding=padding,ceil_mode=ceil,count_include_pad=include,divisor_override=divisor)
 y=torch.nn.functional.avg_pool2d(x,**options)
 cases.append({'input':{'shape':list(x.shape),'data':x.flatten().tolist()},'options':options,'output':{'shape':list(y.shape),'data':y.flatten().tolist()}})
path=Path('packages/kiln/test/fixtures/avg-pool2d-pytorch.json')
path.write_text(json.dumps({'torch_version':torch.__version__,'cases':cases},separators=(',',':'))+'\n')
print('fixtures',len(cases))
