"""Fixed selected-policy confirmation; exact executable aliases share measurements."""
import argparse,json,random,statistics,sys
from pathlib import Path
root=Path('/work');sys.path[:0]=[str(root/'kiln/integrations/passnet'),str(root/'kiln/runtime/python'),str(root/'upstream')]
import torch
from corpus import load_module,canonical_order_inputs
from check_corpus_cuda import check_structure
from measure_policy import sample,save
from runtime import TorchProgram
from qualify_policies import measurement_groups
from pass_bench.torch.test_compiler import get_input_dict
p=root/'study';manifest=json.loads((p/'corpus/manifest.json').read_text());output=root/'results.json'
assert not output.exists()
roles=['baseline','pointwise']+[x['id'] for x in json.loads((root/'proposals/declaration.json').read_text())['policies']]
locations={role:(p/role if role in ['baseline','pointwise'] else root/'proposals'/role) for role in roles}
compiled={role:json.loads((directory/'compile-receipt.json').read_text()) for role,directory in locations.items()}
for receipt in compiled.values():
 assert receipt['membership_sha256']==manifest['membership_sha256']
 assert [r['graph'] for r in receipt['records']]==[r['graph'] for r in manifest['variants']]
# Explicit modified FP32 research reference, not original PassBench scoring.
torch.set_float32_matmul_precision('highest');torch.backends.cudnn.allow_tf32=False
result={'status':'running','scope':'Fixed selected-policy confirmation on all four available fresh exact models; full FP32 matrix and convolution reference; exact aliases share evidence; not PassBench matching/scoring','device':torch.cuda.get_device_name(),'torch':torch.__version__,'seed':42,'warmup':20,'trials':100,'repeats':3,'membership_sha256':manifest['membership_sha256'],'reference_backend':{'matmul_allow_tf32':torch.backends.cuda.matmul.allow_tf32,'cudnn_allow_tf32':torch.backends.cudnn.allow_tf32},'roles':roles,'records':[]}
save(output,result)
for index,record in enumerate(manifest['variants']):
 bindings,groups=measurement_groups(compiled,roles,index)
 row={'graph':record['graph'],'model':record['model'],'bindings':bindings,'measurements':groups};result['records'].append(row);programs={}
 try:
  torch.manual_seed(42);source=root/'upstream'/record['graph']
  named=get_input_dict(argparse.Namespace(model_path=str(source),device='cuda'))
  original=[named[f'in_{i}'] for i in range(len(named))];inputs=canonical_order_inputs(record,original);snapshots=[x.clone() for x in inputs]
  with torch.no_grad():expected=load_module(source/'model.py').GraphModule()(*original)
  for key,m in groups.items():
   if m['status']=='compile_failed':continue
   role=m['policy']
   try:
    program=TorchProgram(locations[role]/compiled[role]['records'][index]['artifact'],include_paths=['/usr/local/cuda/include']);programs[key]=program
    with torch.no_grad():actual=program(*inputs)
    errors=[];check_structure(record['output_structure'],actual,expected,errors)
    for before,after in zip(snapshots,inputs):torch.testing.assert_close(before,after,rtol=0,atol=0,equal_nan=True)
    torch.cuda.synchronize();m.update(status='correct',output_max_abs_errors=errors);del actual
   except Exception as e:m.update(status='correctness_failed',error=str(e))
  for repeat in range(3):
   order=list(programs);random.Random(42+100*index+repeat).shuffle(order)
   for role in order:
    m=row['measurements'][role]
    if m['status'] not in ('correct','measured'):continue
    try:
     attempts=[]
     for attempt in range(3):
      for _ in range(20):programs[role](*inputs)
      torch.cuda.synchronize();observed=sample(programs[role],inputs,100);attempts.append(observed)
      stable=all(observed[k]['iqr']<=.2*observed[k]['median'] for k in ['e2e_ms','stream_elapsed_ms'])
      if stable:break
     m['rounds'].append({'repeat':repeat,'stable':stable,'attempts':attempts});m['status']='measured' if stable else 'timing_unstable'
    except Exception as e:m.update(status='timing_failed',error=str(e))
   save(output,result)
  for m in row['measurements'].values():
   if m['status']=='measured' and len(m['rounds'])==3:m['e2e_median_ms']=statistics.median(r['attempts'][-1]['e2e_ms']['median'] for r in m['rounds'])
 except Exception as e:row.update(status='reference_failed',error=str(e))
 finally:
  for program in programs.values():program.close()
  save(output,result)
 print(index,record['model'],[(k,v['status'],v.get('e2e_median_ms')) for k,v in row['measurements'].items()],flush=True)
result['status']='complete';save(output,result)
