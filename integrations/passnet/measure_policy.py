"""Direct compiler-policy study: correctness, isolated repeated latency, no FX matching.

Training measures all predeclared policies; held-out measures only unchanged Kiln
and the already selected policy. Equal executable fingerprints share evidence.
"""
import argparse
import hashlib
import json
from pathlib import Path
import random
import statistics
import time
import torch
from corpus import load_module,read_manifest
from check_corpus_cuda import check_structure
from runtime import TorchProgram


def save(path, value):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value,indent=2)+'\n');temporary.replace(path)


def summary(values):
    quartiles=statistics.quantiles(values,n=4,method='inclusive')
    median=statistics.median(values)
    return {'median':median,'iqr':quartiles[2]-quartiles[0],
            'mean':statistics.mean(values),'min':min(values),'max':max(values)}


def sample(program,inputs,trials):
    e2e=[];stream=[]
    for _ in range(trials):
        torch.cuda.synchronize();start=time.perf_counter_ns()
        outputs=program(*inputs);torch.cuda.synchronize()
        e2e.append((time.perf_counter_ns()-start)/1e6);del outputs
    start_event=torch.cuda.Event(enable_timing=True);stop_event=torch.cuda.Event(enable_timing=True)
    for _ in range(trials):
        start_event.record();outputs=program(*inputs);stop_event.record();stop_event.synchronize()
        stream.append(start_event.elapsed_time(stop_event));del outputs
    return {'e2e_ms':summary(e2e),'stream_elapsed_ms':summary(stream),'raw_e2e_ms':e2e,'raw_stream_elapsed_ms':stream}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',type=Path,required=True)
    parser.add_argument('--artifacts',type=Path,required=True)
    parser.add_argument('--upstream',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--phase',choices=['train','heldout'],required=True)
    parser.add_argument('--selection',type=Path)
    parser.add_argument('--include-path',action='append',default=[])
    args=parser.parse_args()
    if args.output.exists():raise ValueError('Preserve existing measurements; choose a new run filename')
    manifest=read_manifest(args.corpus)
    plan=json.loads((args.corpus/'measurement-plan.json').read_text())
    if plan['membership_sha256']!=manifest['membership_sha256']:raise ValueError('Measurement membership mismatch')
    if plan['trials']<2 or plan['repeats']<1 or plan['warmup']<0 or plan['max_retries']<0:raise ValueError('Invalid measurement budget')
    gate=json.loads((args.artifacts/'sensitivity.json').read_text())
    if gate['membership_sha256']!=manifest['membership_sha256'] or not gate['default_equals_unchanged']:raise ValueError('Unqualified policy controls')
    policies=plan['candidate_ids']
    if args.phase=='heldout':
        if not args.selection:raise ValueError('Held-out timing requires completed training selection')
        selection=json.loads(args.selection.read_text())
        if selection['membership_sha256']!=manifest['membership_sha256'] or selection['format']!='kiln-policy-selection/1':raise ValueError('Invalid training selection')
        if selection['selected_policy'] not in policies:raise ValueError('Selected policy was not predeclared')
        policies=list(dict.fromkeys(['baseline',selection['selected_policy']]))
    elif args.selection:raise ValueError('Training must not depend on an existing selection')
    compiled={name:json.loads((args.artifacts/name/'compile-receipt.json').read_text()) for name in policies}
    for name,receipt in compiled.items():
        if receipt['membership_sha256']!=manifest['membership_sha256']:raise ValueError('Artifact membership mismatch')
        if [r['graph'] for r in receipt['records']]!=[r['graph'] for r in manifest['variants']]:raise ValueError('Artifact graph identity mismatch')
        if any(r['status']!='compiled' for r in receipt['records']):raise ValueError('Incomplete successful compilation required')
        for index,record in enumerate(receipt['records']):
            if Path(record['artifact']).name!=record['artifact']:raise ValueError('Invalid artifact filename')
            digest=hashlib.sha256((args.artifacts/name/record['artifact']).read_bytes()).hexdigest()
            if digest!=gate['artifact_sha256'][name][index]:raise ValueError('Compiled artifact changed after structural gate')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    result={'format':'kiln-policy-measurement/1','status':'running','phase':args.phase,
            'membership_sha256':manifest['membership_sha256'],'plan':plan,'policies':policies,
            'device':torch.cuda.get_device_name(),'torch_version':torch.__version__,
            'expected_graphs':[r['graph'] for r in manifest['variants'] if r['split']==args.phase],'records':[]}
    for index,record in enumerate(manifest['variants']):
        if record['split']!=args.phase:continue
        print('START',args.phase,record['graph'],flush=True)
        from pass_bench.torch.test_compiler import get_input_dict
        torch.manual_seed(plan['seed'])
        source=args.upstream/record['graph']
        named=get_input_dict(argparse.Namespace(model_path=str(source),device='cuda'))
        inputs=[named[f'in_{i}'] for i in range(len(named))]
        snapshots=[value.clone() for value in inputs]
        with torch.no_grad():expected=load_module(source/'model.py').GraphModule()(*inputs)
        groups={};bindings={};programs={}
        row={'graph':record['graph'],'sample':record['sample'],'split':record['split'],'bindings':bindings,'measurements':groups}
        try:
            for policy_id in policies:
                artifact=compiled[policy_id]['records'][index];fingerprint=artifact['fingerprint']
                bindings[policy_id]=fingerprint
                if fingerprint in groups:continue
                measurement={'policy':policy_id,'fingerprint':fingerprint,'status':'initializing','rounds':[]};groups[fingerprint]=measurement
                try:
                    started=time.perf_counter()
                    program=TorchProgram(args.artifacts/policy_id/artifact['artifact'],include_paths=args.include_path)
                    measurement['program_load_ms']=(time.perf_counter()-started)*1000;programs[fingerprint]=program
                    actual=program(*inputs);errors=[];check_structure(record['output_structure'],actual,expected,errors)
                    for original,current in zip(snapshots,inputs):torch.testing.assert_close(current,original,rtol=0,atol=0,equal_nan=True)
                    torch.cuda.synchronize();measurement.update(status='correct',output_max_abs_errors=errors)
                    del actual
                except Exception as error:measurement.update(status='correctness_failed',error=str(error))
            for repeat in range(plan['repeats']):
                order=list(groups);random.Random(plan['seed']+index*100+repeat).shuffle(order)
                for fingerprint in order:
                    measurement=groups[fingerprint]
                    if measurement['status'] not in ('correct','measured'):continue
                    program=programs[fingerprint];attempts=[]
                    for _ in range(plan['max_retries']+1):
                        for _ in range(plan['warmup']):program(*inputs)
                        torch.cuda.synchronize();observed=sample(program,inputs,plan['trials']);attempts.append(observed)
                        stable=all(observed[key]['iqr']<=plan['max_iqr_fraction']*observed[key]['median'] for key in ['e2e_ms','stream_elapsed_ms'])
                        if stable:break
                    measurement['rounds'].append({'repeat':repeat,'attempts':attempts,'stable':stable})
                    measurement['status']='measured' if stable else 'timing_unstable'
                result['records']=[r for r in result['records'] if r['graph']!=record['graph']]+[row]
                save(args.output,result)
            for measurement in groups.values():
                if measurement['status']=='measured' and len(measurement['rounds'])==plan['repeats']:
                    measurement['e2e_median_ms']=statistics.median(r['attempts'][-1]['e2e_ms']['median'] for r in measurement['rounds'])
                    measurement['stream_elapsed_median_ms']=statistics.median(r['attempts'][-1]['stream_elapsed_ms']['median'] for r in measurement['rounds'])
        finally:
            torch.cuda.synchronize()
            for program in programs.values():program.close()
        result['records']=[r for r in result['records'] if r['graph']!=record['graph']]+[row]
        save(args.output,result)
        print('DONE',record['graph'],{m['policy']:m['status'] for m in groups.values()},flush=True)
    if [r['graph'] for r in result['records']]!=result['expected_graphs']:raise ValueError('Incomplete measurement membership')
    result['status']='complete';save(args.output,result)


if __name__=='__main__':main()
