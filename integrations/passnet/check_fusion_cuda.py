"""Independent fusion fixture equations and CUDA validation (promoted from script 189)."""
import argparse
import hashlib
import json
from pathlib import Path
import torch
from runtime import TorchProgram,DTYPES


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--include-path',action='append',default=[])
    args=parser.parse_args()
    if args.output.exists():raise ValueError('Preserve existing correctness receipts')
    manifest=json.loads((args.directory/'manifest.json').read_text());records=[]
    if manifest['format']!='kiln-selective-fusion-fixtures/1':raise ValueError('Invalid fixture format')
    for fixture in manifest['records']:
        if fixture['kind'] not in ['elementwise','reduction','nested'] or fixture['dtype'] not in ['f32','f16','bf16'] or set(fixture['inputs'])!={'x','y','z'}:raise ValueError('Unsupported fixture semantics')
        artifact=args.directory/fixture['artifact']
        if hashlib.sha256(artifact.read_bytes()).hexdigest()!=fixture['artifact_sha256']:raise ValueError('Fixture artifact changed')
        program=TorchProgram(artifact,include_paths=args.include_path)
        try:
            for seed in [1,7,42]:
                torch.manual_seed(seed);dtype=DTYPES[fixture['dtype']]
                inputs=[torch.randn(fixture['inputs'][name],device='cuda').to(dtype) for name in ['x','y','z']];snapshots=[x.clone() for x in inputs];x,y,z=inputs
                p=(torch.exp(x.float()) if fixture['kind']=='elementwise' else (x.float()*x.float()).sum(-1,keepdim=True)).to(dtype)
                a=((p.float()+p.float()).sum(0,keepdim=True) if fixture['kind']=='nested' else p.float()+y.float()).to(dtype)
                expected={'a':a,'b':(p.float()*z.float()).to(dtype)}
                observed=program(*inputs);torch.cuda.synchronize();row={k:fixture[k] for k in ['kind','dtype','policy','artifact']};row['seed']=seed
                try:
                    if set(observed)!=set(expected):raise ValueError('Output structure changed')
                    errors={}
                    for key,want in expected.items():
                        torch.testing.assert_close(observed[key],want,rtol={'f32':1.3e-6,'f16':1e-3,'bf16':.016}[fixture['dtype']],atol=1e-5,equal_nan=True)
                        errors[key]=(observed[key].float()-want.float()).abs().max().item()
                    for before,after in zip(snapshots,inputs):torch.testing.assert_close(before,after,rtol=0,atol=0)
                    row.update(status='passed',max_abs_errors=errors)
                except Exception as error:row.update(status='failed',error=str(error))
                records.append(row);args.output.write_text(json.dumps({'status':'running','records':records},indent=2)+'\n')
        finally:program.close()
        print(fixture['artifact'],[r['status'] for r in records[-3:]],flush=True)
    receipt={'status':'complete','scope':manifest['scope'],'gpu':torch.cuda.get_device_name(),'torch_version':torch.__version__,
             'comparisons':len(records),'passed':sum(r['status']=='passed' for r in records),'records':records}
    args.output.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='records'}))
    if receipt['passed']!=receipt['comparisons']:raise SystemExit(1)


if __name__=='__main__':main()
