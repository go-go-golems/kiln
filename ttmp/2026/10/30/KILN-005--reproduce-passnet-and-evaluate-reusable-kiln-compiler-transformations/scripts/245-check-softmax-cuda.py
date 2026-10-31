#!/usr/bin/env python3
"""Independent source replay for all softmax forms, shapes and dtypes."""
import json,sys
from pathlib import Path
sys.path[:0]=['/work/kiln/runtime/python','/work/kiln/integrations/passnet']
import torch
from corpus import read_manifest,load_module,source_order_inputs
from check_corpus_cuda import check_structure
from runtime import TorchProgram,DTYPES
root=Path('/work');directory=root/'softmax-fixtures';manifest=read_manifest(directory);compiled=json.loads((directory/'compile-receipt.json').read_text());records=[];output=root/'softmax-cuda.json'
if output.exists():raise ValueError('Preserve old correctness receipt')
for index,row in enumerate(manifest['variants']):
 if compiled[index]['graph']!=row['graph'] or compiled[index]['returncode']!=0:raise ValueError('Incomplete fixture compilation')
 model=load_module(root/'softmax-probe-models'/row['graph']/'model.py').GraphModule()
 program=TorchProgram(directory/compiled[index]['artifact'],include_paths=['/usr/local/cuda/include'])
 try:
  for seed in [1,7,42]:
   torch.manual_seed(seed);inputs=[torch.randn(shape,device='cuda').to(DTYPES[row['input_dtypes'][name]]) for name,shape in row['inputs'].items()];inputs=[(x*16 if seed==7 else x+1000 if seed==42 else x) for x in inputs];snapshots=[x.clone() for x in inputs]
   expected=model(*source_order_inputs(row,inputs));actual=program(*inputs);torch.cuda.synchronize();result={'graph':row['graph'],'seed':seed}
   try:
    errors=[];check_structure(row['output_structure'],actual,expected,errors)
    for before,after in zip(snapshots,inputs):torch.testing.assert_close(before,after,rtol=0,atol=0)
    result.update(status='passed',max_abs_errors=errors)
   except Exception as error:result.update(status='failed',error=str(error))
   records.append(result);output.write_text(json.dumps({'status':'running','records':records},indent=2)+'\n')
 finally:program.close()
 print(row['graph'],[r['status'] for r in records[-3:]],flush=True)
receipt={'status':'complete','scope':'Independent softmax source fixtures; no original benchmark coverage','gpu':torch.cuda.get_device_name(),'torch_version':torch.__version__,'comparisons':len(records),'passed':sum(r['status']=='passed' for r in records),'records':records}
output.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='records'}))
if receipt['passed']!=receipt['comparisons']:raise SystemExit(1)
