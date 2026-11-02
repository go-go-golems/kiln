"""Collect all matrix fixture diagnostics without weakening numerical tolerances."""
import argparse,hashlib,json
from pathlib import Path
import torch
from corpus import read_manifest,load_module
from check_corpus_cuda import check_structure,DTYPES
from runtime import TorchProgram
p=argparse.ArgumentParser(description=__doc__)
for key in ['directory','upstream','output']:p.add_argument('--'+key,type=Path,required=True)
p.add_argument('--include-path',action='append',default=[]);a=p.parse_args()
if a.output.exists():raise ValueError('Preserve previous matrix diagnostics')
manifest=read_manifest(a.directory)
result={'format':'kiln-linalg-validation/1','device':torch.cuda.get_device_name(),'torch_version':torch.__version__,'float32_matmul_precision':torch.get_float32_matmul_precision(),'status':'running','seeds':[1,7,42],'records':[]}
for entry in manifest['variants']:
 artifact=(a.directory/entry['script']).with_suffix('.json');program=None
 try:
  program=TorchProgram(artifact,include_paths=a.include_path)
  model=load_module(a.upstream/entry['graph']/'model.py').GraphModule()
  for seed in result['seeds']:
   row={'graph':entry['graph'],'seed':seed,'artifact_sha256':hashlib.sha256(artifact.read_bytes()).hexdigest()}
   try:
    torch.manual_seed(seed);inputs=[torch.randn(shape,device='cuda').to(DTYPES[entry['input_dtypes'][name]]) for name,shape in entry['inputs'].items()]
    snapshots=[value.clone() for value in inputs]
    with torch.no_grad():expected=model(*inputs)
    actual=program(*inputs);errors=[];check_structure(entry['output_structure'],actual,expected,errors)
    for value,want in zip(inputs,snapshots):torch.testing.assert_close(value,want,rtol=0,atol=0)
    torch.cuda.synchronize();row.update(status='passed',output_max_abs_errors=errors)
   except Exception as error:row.update(status='failed',error=str(error))
   result['records'].append(row)
   a.output.write_text(json.dumps(result,indent=2)+'\n');print(entry['graph'],seed,row['status'],flush=True)
 except Exception as error:
  result['records'].append({'graph':entry['graph'],'seed':None,'status':'initialization_failed','error':str(error)})
 finally:
  if program is not None:program.close()
result.update(status='complete',all_passed=len(result['records'])==len(manifest['variants'])*len(result['seeds']) and all(r['status']=='passed' for r in result['records']))
a.output.write_text(json.dumps(result,indent=2)+'\n')
if not result['all_passed']:raise SystemExit(1)
