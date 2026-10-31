"""Validate all source-derived fourth-task exports; require complete compile receipt."""
import importlib.util
import json
from pathlib import Path
import sys
import torch
from runtime import TorchProgram
root=Path(sys.argv[1]);manifest=json.loads((root/'fourth-task/manifest.json').read_text())
receipt=json.loads((root/'fourth-task/compile-receipt.json').read_text())
assert len(receipt)==len(manifest['variants']) and all(r['returncode']==0 for r in receipt)
types={'f32':torch.float32,'f16':torch.float16,'bf16':torch.bfloat16}
results=[]
for i,record in enumerate(manifest['variants']):
 source=root/'upstream'/record['graph']/'model.py'
 spec=importlib.util.spec_from_file_location(f'original_{i}',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 artifact=(root/'fourth-task'/record['script']).with_suffix('.json')
 p=TorchProgram(artifact,include_paths=['/usr/local/cuda/include'])
 torch.manual_seed(42)
 inputs=[torch.randn(shape,device='cuda').to(types[record['input_dtypes'][name]]) for name,shape in record['inputs'].items()]
 actual=p(*inputs);expected=module.GraphModule()(*inputs)
 for j,reference in enumerate(expected):
  value=actual[f'out{j}']
  assert value.dtype==reference.dtype and value.shape==reference.shape
  torch.testing.assert_close(value,reference,rtol={torch.float32:1.3e-6,torch.float16:1e-3,torch.bfloat16:1.6e-2}[reference.dtype],atol=1e-5)
 actual=actual['out1'];expected=expected[1]
 tolerance={torch.float32:1.3e-6,torch.float16:1e-3,torch.bfloat16:1.6e-2}[expected.dtype]
 assert actual.dtype==expected.dtype
 torch.testing.assert_close(actual,expected,rtol=tolerance,atol=1e-5)
 torch.cuda.synchronize();p.close()
 results.append({'graph':record['graph'],'status':'passed','max_abs_error':(actual-expected).abs().max().item()})
 (root/'fourth-task/gpu-receipt.json').write_text(json.dumps(results,indent=2)+'\n')
 print(i,'PASS',record['graph'],flush=True)
