"""Validate both GELU modes against native PyTorch CUDA without tolerance changes."""
import argparse
import hashlib
import json
from pathlib import Path
import torch
from corpus import read_manifest
from check_corpus_cuda import check_structure
from runtime import TorchProgram

def run(directory,output,include_paths):
    if output.exists():raise ValueError('Preserve prior CUDA qualification')
    manifest=read_manifest(directory)
    compiled=json.loads((directory/'compile-receipt.json').read_text())
    assert [row['graph'] for row in compiled]==[row['graph'] for row in manifest['variants']]
    assert all(row['returncode']==0 for row in compiled)
    result={'format':'kiln-gelu-cuda-validation/1','status':'running','device':torch.cuda.get_device_name(),'torch':torch.__version__,'records':[]}
    for record,artifact in zip(manifest['variants'],compiled):
        path=directory/artifact['artifact'];program=TorchProgram(path,include_paths=include_paths)
        try:
            dtype={'f32':torch.float32,'f16':torch.float16,'bf16':torch.bfloat16}[record['input_dtypes']['v0']]
            shape=record['inputs']['v0']
            for seed in [1,7,42]:
                row={'graph':record['graph'],'dtype':str(dtype),'shape':shape,'seed':seed,'artifact_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                try:
                    torch.manual_seed(seed);x=(torch.randn(shape,device='cuda')*4).to(dtype)
                    edges=torch.tensor([-100,-20,-8,-3,-1,-1e-6,-0.0,0,1e-6,1,3,8,20,100],device='cuda',dtype=dtype)
                    if x.numel()>=len(edges):x.reshape(-1)[:len(edges)]=edges
                    before=x.clone()
                    with torch.no_grad():
                        exact=torch.nn.functional.gelu(x);approx=torch.nn.functional.gelu(x,approximate='tanh')
                        expected=(exact,approx,exact+1)
                        actual=program(x)
                    errors=[];check_structure(record['output_structure'],actual,expected,errors)
                    torch.testing.assert_close(x,before,rtol=0,atol=0,equal_nan=True)
                    torch.cuda.synchronize();row.update(status='passed',output_max_abs_errors=errors)
                except Exception as error:row.update(status='failed',error=str(error))
                result['records'].append(row);output.write_text(json.dumps(result,indent=2)+'\n');print(record['graph'],seed,row['status'],flush=True)
        finally:program.close()
    result.update(status='complete',all_passed=all(row['status']=='passed' for row in result['records']))
    output.write_text(json.dumps(result,indent=2)+'\n')
    if not result['all_passed']:raise SystemExit(1)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--include-path',action='append',default=[])
    args=parser.parse_args();run(args.directory,args.output,args.include_path)
