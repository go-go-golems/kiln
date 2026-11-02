"""Compare compiled Kiln max_pool2d programs against native CUDA PyTorch."""
import argparse,json
from pathlib import Path
import torch
from runtime import TorchProgram
p=argparse.ArgumentParser();p.add_argument('--fixtures',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
manifest=json.loads((a.fixtures/'manifest.json').read_text());rows=[]
dtypes={'f32':torch.float32,'f16':torch.float16,'bf16':torch.bfloat16}
for row in manifest['records']:
 result={'index':row['index'],'dtype':row['dtype']};program=None
 try:
  x=torch.tensor(row['input']['data'],device='cuda',dtype=dtypes[row['dtype']]).reshape(row['input']['shape']);before=x.clone()
  expected=torch.nn.functional.max_pool2d(x,**row['options'])
  program=TorchProgram(a.fixtures/row['artifact'],include_paths=['/usr/local/cuda/include']);actual=program(x)['out']
  torch.testing.assert_close(x,before,rtol=0,atol=0,equal_nan=True)
  torch.testing.assert_close(actual,expected,rtol=0,atol=0,equal_nan=True)
  torch.cuda.synchronize();result['status']='passed'
 except Exception as e:result.update(status='failed',error=str(e))
 finally:
  if program:program.close()
 rows.append(result);a.output.write_text(json.dumps({'source_sha256':manifest['source_sha256'],'torch_version':torch.__version__,'gpu':torch.cuda.get_device_name(),'records':rows},indent=2)+'\n');print(result,flush=True)
if any(r['status']!='passed' for r in rows):raise SystemExit(1)
