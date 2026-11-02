"""Post-selection numerical stress; never feeds back into the chosen policy.

Compare unchanged and selected programs on seeded random FP32 inputs satisfying
source-derived running-variance domains. Report failures without filtering them.
"""
import argparse
import hashlib
import json
from pathlib import Path
import torch
from corpus import read_manifest,load_module
from check_corpus_cuda import check_structure
from runtime import TorchProgram
from measure_policy import save


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ['corpus','artifacts','upstream','selection','output']:p.add_argument('--'+key,type=Path,required=True)
    p.add_argument('--include-path',action='append',default=[])
    args=p.parse_args()
    if args.output.exists():raise ValueError('Preserve earlier stress evidence')
    manifest=read_manifest(args.corpus);selection=json.loads(args.selection.read_text());chosen=selection['selected_policy']
    if selection['membership_sha256']!=manifest['membership_sha256']:raise ValueError('Selection membership mismatch')
    policies=list(dict.fromkeys(['baseline',chosen]));domains=json.loads((args.corpus/'reference-domains.json').read_text())
    gate=json.loads((args.artifacts/'sensitivity.json').read_text())
    compiled={name:json.loads((args.artifacts/name/'compile-receipt.json').read_text()) for name in policies}
    result={'format':'kiln-policy-stress/1','membership_sha256':manifest['membership_sha256'],
            'selected_policy':chosen,'seeds':[1,7,42],'scope':'Post-selection diagnostic, no policy retuning; domain-valid random FP32 inputs',
            'status':'running','records':[]}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    for index,record in enumerate(manifest['variants']):
        model=load_module(args.upstream/record['graph']/'model.py').GraphModule()
        constraints=next(r['constraints'] for r in domains['records'] if r['graph']==record['graph'])
        programs={}
        try:
            for name in policies:
                artifact=args.artifacts/name/compiled[name]['records'][index]['artifact']
                if hashlib.sha256(artifact.read_bytes()).hexdigest()!=gate['artifact_sha256'][name][index]:raise ValueError('Artifact changed after qualification')
                programs[name]=TorchProgram(artifact,include_paths=args.include_path)
            for seed in result['seeds']:
                torch.manual_seed(seed+index*100)
                if set(record['input_dtypes'].values())!={'f32'}:raise ValueError('FP32 study expected')
                named={name:torch.randn(shape,device='cuda') for name,shape in record['inputs'].items()}
                for constraint in constraints:
                    if constraint['kind']!='positive':raise ValueError('Unknown reference domain')
                    named[constraint['input']]=named[constraint['input']].abs()+constraint['offset']
                inputs=list(named.values());snapshots=[x.clone() for x in inputs]
                with torch.no_grad():expected=model(*inputs)
                for name,program in programs.items():
                    row={'graph':record['graph'],'split':record['split'],'policy':name,'seed':seed}
                    try:
                        actual=program(*inputs);errors=[]
                        check_structure(record['output_structure'],actual,expected,errors)
                        for original,value in zip(snapshots,inputs):torch.testing.assert_close(value,original,rtol=0,atol=0)
                        torch.cuda.synchronize();row.update(status='passed',output_max_abs_errors=errors)
                    except Exception as error:row.update(status='failed',error=str(error))
                    result['records'].append(row);save(args.output,result)
                    print(name,seed,row['status'],record['graph'],flush=True)
        finally:
            torch.cuda.synchronize()
            for program in programs.values():program.close()
    result['status']='complete';result['all_passed']=all(r['status']=='passed' for r in result['records'])
    result['comparisons']=len(result['records']);save(args.output,result)
    if not result['all_passed']:raise SystemExit(1)


if __name__=='__main__':main()
