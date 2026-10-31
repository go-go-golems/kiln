"""Measure an already frozen compiler source pair, with no training selection."""
import argparse
import hashlib
import json
from pathlib import Path
import random
import statistics
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime/python'))
import torch
from compiler_confirmation import ROLES,read,sha,verify_freeze,summarize,write
from corpus import load_module
from check_corpus_cuda import check_structure,RTOL
from measure_policy import sample,save
from runtime import TorchProgram


def run(corpus,artifacts,upstream,output,include_paths,passbench):
    corpus=Path(corpus);artifacts=Path(artifacts);upstream=Path(upstream);output=Path(output);passbench=Path(passbench)
    sys.path.insert(0,str(passbench.resolve()))
    if output.exists():raise ValueError('Preserve existing measurements')
    manifest,plan,frozen=verify_freeze(corpus,Path(__file__).resolve().parents[2])
    if plan['candidate_ids']!=list(ROLES) or plan['reference_backend_numerics']!={'float32_matmul_precision':'highest'}:raise ValueError('Unsupported fixed source/reference declaration')
    if plan['dtype_tolerances']!={'f32':{'rtol':RTOL[torch.float32],'atol':1e-5}}:raise ValueError('Frozen tolerance differs from implementation')
    qualification=read(artifacts/'pair-qualification.json');compiled={role:read(artifacts/role/'compile-receipt.json') for role in ROLES}
    if qualification['membership_sha256']!=manifest['membership_sha256']:raise ValueError('Qualification membership differs')
    for role in ROLES:
        if [r['graph'] for r in compiled[role]['records']]!=[r['graph'] for r in manifest['variants']]:raise ValueError('Incomplete artifact graph membership')
        for q in qualification['records'][role]:
            if q and sha(artifacts/role/q['artifact'])!=q['artifact_sha256']:raise ValueError('Artifact changed after qualification')
    result={'format':'kiln-fixed-compiler-confirmation-measurement/1','status':'running','membership_sha256':manifest['membership_sha256'],'plan':plan,'freeze_sha256':sha(corpus/'confirmation-freeze.json'),'qualification_sha256':sha(artifacts/'pair-qualification.json'),'device':torch.cuda.get_device_name(),'torch':torch.__version__,'passbench_source_sha256':{name:sha(passbench/name) for name in ['pass_bench/torch/test_compiler.py','pass_bench/torch/utils.py']},'records':[]}
    output.parent.mkdir(parents=True,exist_ok=True);prior=torch.get_float32_matmul_precision()
    try:
        torch.set_float32_matmul_precision('highest')
        if torch.backends.cuda.matmul.allow_tf32:raise ValueError('Declared full-FP32 reference unavailable')
        result['reference_backend_numerics']={'float32_matmul_precision':torch.get_float32_matmul_precision(),'allow_tf32':torch.backends.cuda.matmul.allow_tf32}
        for index,record in enumerate(manifest['variants']):
            print('START',record['graph'],flush=True)
            row={'graph':record['graph'],'sample':record['sample'],'model':record['model'],'category':record['category'],'bindings':{},'measurements':{}};programs={}
            result['records'].append(row);save(output,result)
            try:
                from pass_bench.torch.test_compiler import get_input_dict
                torch.manual_seed(plan['seed'])
                for name,digest in record['source_files_sha256'].items():
                    if sha(upstream/record['graph']/name)!=digest:raise ValueError('Original source bytes changed')
                named=get_input_dict(argparse.Namespace(model_path=str(upstream/record['graph']),device='cuda'))
                inputs=[named[f'in_{i}'] for i in range(len(named))];snapshots=[value.clone() for value in inputs]
                with torch.no_grad():expected=load_module(upstream/record['graph']/'model.py').GraphModule()(*inputs)
                if torch.backends.cuda.matmul.allow_tf32:raise ValueError('Source changed frozen FP32 reference mode')
                for role in ROLES:
                    q=qualification['records'][role][index];build=compiled[role]['records'][index]
                    fingerprint=q['fingerprint'] if q else 'compile-failed-'+role
                    row['bindings'][role]=fingerprint
                    if fingerprint in row['measurements']:continue
                    measurement={'roles':[name for name in ROLES if qualification['records'][name][index] and qualification['records'][name][index]['fingerprint']==fingerprint],'status':'initializing','rounds':[]};row['measurements'][fingerprint]=measurement
                    if not q:measurement.update(status='compile_failed',error=build['error']);continue
                    try:
                        program=TorchProgram(artifacts/role/q['artifact'],include_paths=include_paths);programs[fingerprint]=program
                        with torch.no_grad():actual=program(*inputs)
                        errors=[];check_structure(record['output_structure'],actual,expected,errors)
                        for before,after in zip(snapshots,inputs):torch.testing.assert_close(before,after,rtol=0,atol=0,equal_nan=True)
                        torch.cuda.synchronize();measurement.update(status='correct',output_max_abs_errors=errors);del actual
                    except Exception as error:measurement.update(status='correctness_failed',error=str(error))
                for repeat in range(plan['repeats']):
                    order=list(row['measurements']);random.Random(plan['seed']+index*100+repeat).shuffle(order)
                    for fingerprint in order:
                        measurement=row['measurements'][fingerprint]
                        if measurement['status'] not in ('correct','measured'):continue
                        program=programs[fingerprint];attempts=[]
                        try:
                            for _ in range(plan['max_retries']+1):
                                for _ in range(plan['warmup']):program(*inputs)
                                torch.cuda.synchronize();observed=sample(program,inputs,plan['trials']);attempts.append(observed)
                                stable=all(observed[key]['iqr']<=plan['max_iqr_fraction']*observed[key]['median'] for key in ['e2e_ms','stream_elapsed_ms'])
                                if stable:break
                            measurement['rounds'].append({'repeat':repeat,'attempts':attempts,'stable':stable});measurement['status']='measured' if stable else 'timing_unstable'
                        except Exception as error:measurement.update(status='measurement_failed',error=str(error))
                    save(output,result)
                for measurement in row['measurements'].values():
                    if measurement['status']=='measured' and len(measurement['rounds'])==plan['repeats']:
                        measurement['e2e_median_ms']=statistics.median(r['attempts'][-1]['e2e_ms']['median'] for r in measurement['rounds'])
                        measurement['stream_elapsed_median_ms']=statistics.median(r['attempts'][-1]['stream_elapsed_ms']['median'] for r in measurement['rounds'])
            except Exception as error:
                row['reference_error']=str(error)
                for role in ROLES:
                    fingerprint=row['bindings'].setdefault(role,'reference-failed-'+role)
                    row['measurements'].setdefault(fingerprint,{'status':'reference_failed','error':str(error),'rounds':[]})
            finally:
                torch.cuda.synchronize()
                for program in programs.values():program.close()
            save(output,result);print('DONE',record['graph'],[m['status'] for m in row['measurements'].values()],flush=True)
        result['status']='complete';save(output,result)
        summary=summarize(manifest,plan,result);write(output.with_name(output.stem+'-summary.json'),summary)
        print(json.dumps({k:v for k,v in summary.items() if k!='records'},indent=2),flush=True)
    finally:torch.set_float32_matmul_precision(prior)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['corpus','artifacts','upstream','output','passbench']:parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--include-path',action='append',default=[]);args=parser.parse_args()
    run(args.corpus,args.artifacts,args.upstream,args.output,args.include_path,args.passbench)

if __name__=='__main__':main()
