#!/usr/bin/env python3
"""Exercise all declared LayerNorm forms, dtypes, seeds and constant-input cases."""
import json,sys
from pathlib import Path
sys.path[:0]=['/work/kiln/runtime/python','/work/kiln/integrations/passnet']
import torch
from corpus import read_manifest,load_module,source_order_inputs
from check_corpus_cuda import check_structure
from runtime import TorchProgram,DTYPES
root=Path('/work');directory=root/'layernorm-fixtures';manifest=read_manifest(directory);compiled=json.loads((directory/'compile-receipt.json').read_text());rows=[]
output=root/'layernorm-cuda.json'
for index,record in enumerate(manifest['variants']):
 if compiled[index]['graph']!=record['graph'] or compiled[index]['returncode']!=0:raise ValueError('Unqualified fixture artifact')
 model=load_module(root/'layernorm-probe-models'/record['graph']/'model.py').GraphModule()
 program=TorchProgram(directory/compiled[index]['artifact'],include_paths=['/usr/local/cuda/include'])
 try:
  for seed in [1,7,42]:
   for mode in ['random','constant-x']:
    torch.manual_seed(seed)
    inputs=[torch.randn(shape,device='cuda').to(DTYPES[record['input_dtypes'][name]]) for name,shape in record['inputs'].items()]
    if mode=='constant-x':inputs[0].fill_(4)
    snapshots=[value.clone() for value in inputs];expected=model(*source_order_inputs(record,inputs));actual=program(*inputs);torch.cuda.synchronize()
    row={'graph':record['graph'],'seed':seed,'mode':mode,'dtype':str(inputs[0].dtype),'max_abs':float((actual['out0']-expected[0]).abs().max())}
    try:
     check_structure(record['output_structure'],actual,expected,[])
     for before,after in zip(snapshots,inputs):torch.testing.assert_close(before,after,rtol=0,atol=0)
     row['status']='passed'
    except Exception as error:row.update(status='failed',error=str(error))
    rows.append(row);output.write_text(json.dumps({'status':'running','records':rows},indent=2)+'\n')
 finally:program.close()
 print(record['graph'],sum(r['status']=='passed' for r in rows if r['graph']==record['graph']),'/6',flush=True)
receipt={'status':'complete','comparisons':len(rows),'passed':sum(r['status']=='passed' for r in rows),'failed':sum(r['status']!='passed' for r in rows),'gpu':torch.cuda.get_device_name(),'torch':torch.__version__,'scope':'Independent fixtures, random and constant input, seeds 1/7/42; standard dtype tolerances; not original benchmark coverage','records':rows}
output.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='records'}))
if receipt['failed']:raise SystemExit(1)
