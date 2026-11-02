#!/usr/bin/env python3
"""Verify collected ownership, frozen identity, aliases and raw timing summaries."""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0,str(repo/'integrations/passnet'))
from qualify_policies import qualify,measurement_groups
from policy_search import confirmation_policies,select_searches

parser=argparse.ArgumentParser(description=__doc__)
for name in ['study','artifacts','terminal','output']:parser.add_argument('--'+name,type=Path,required=True)
parser.add_argument('--training',type=Path)
parser.add_argument('--selection',type=Path)
args=parser.parse_args()
read=lambda path:json.loads(path.read_text())
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
terminal=args.terminal;corpus=args.study/'corpus';artifacts=args.artifacts
collection=read(terminal/'collection.json')
for name,want in collection['files_sha256'].items():assert sha(terminal/name)==want,name
run=read(terminal/'run.json');bundle=read(terminal/'bundle.json')
assert run['status']=='complete' and run['returncode']==0 and run['container_absent'] and not run['gpu_processes_after']
assert collection['container_absent'] and not collection['gpu_processes_now']
manifest=read(corpus/'manifest.json');plan=read(corpus/'measurement-plan.json');freeze=read(corpus/'candidate-freeze.json')
for name,want in freeze['files_sha256'].items():assert sha(corpus/name)==want,name
for name,want in bundle['files_sha256'].items():
    prefix,_,relative=name.partition('/')
    directory={'repo':repo,'corpus':corpus,'artifacts':artifacts,'upstream':ticket/'sources/upstream'}.get(prefix)
    if directory:assert sha(directory/relative)==want,name
    else:
        path={'run.py':ticket/'scripts/439-run-policy-search-evaluation.py',
              'reference.py':ticket/'scripts/179-run-rich-full-precision.py',
              'training.json':args.training,'selection.json':args.selection}[name]
        assert path and sha(path)==want,name
assert bundle['source_snapshot']==read(artifacts/'study-compile-receipt.json')['source_snapshot']
assert qualify(corpus,artifacts)==read(artifacts/'sensitivity.json')
data=read(terminal/'output/measurement.json')
assert data['plan']==plan and data['status']=='complete'
assert data['membership_sha256']==manifest['membership_sha256']==bundle['membership_sha256']
assert data['phase']==run['phase']==bundle['phase']
assert data['backend_numerics']['float32_matmul_precision']=='highest' and not data['backend_numerics']['matmul_allow_tf32']
if data['phase']=='train':
    assert data['policies']==plan['candidate_ids']
else:
    assert args.training and args.selection
    selected=read(args.selection)
    assert selected==select_searches(read(args.training))
    assert data['policies']==confirmation_policies(plan,selected)
    assert sha(args.selection)==bundle['files_sha256']['selection.json']
    assert sha(args.training)==bundle['files_sha256']['training.json']
expected=[r for r in manifest['variants'] if r['split']==data['phase']]
assert data['expected_graphs']==[r['graph'] for r in expected]==[r['graph'] for r in data['records']]
compiled={p:read(artifacts/p/'compile-receipt.json') for p in data['policies']}
status=Counter();timed=0;samples=0
for source,row in zip(expected,data['records']):
    assert row['sample']==source['sample'] and row['split']==source['split']
    index=manifest['variants'].index(source)
    bindings,groups=measurement_groups(compiled,data['policies'],index)
    assert row['bindings']==bindings and set(row['measurements'])==set(groups)
    for key,measurement in row['measurements'].items():
        assert measurement['policy']==groups[key]['policy']
        status[measurement['status']]+=1
        if measurement['status']=='compile_failed':
            assert measurement==groups[key];continue
        assert measurement['fingerprint']==groups[key]['fingerprint']
        assert measurement['status'] in ['measured','correctness_failed','timing_unstable']
        for repeat,round_ in enumerate(measurement['rounds']):
            assert round_['repeat']==repeat and 1<=len(round_['attempts'])<=plan['max_retries']+1
            for attempt_index,attempt in enumerate(round_['attempts']):
                stable=True
                for label,raw_label in [('e2e_ms','raw_e2e_ms'),('stream_elapsed_ms','raw_stream_elapsed_ms')]:
                    raw=attempt[raw_label]
                    assert len(raw)==plan['trials'] and all(math.isfinite(v) and v>0 for v in raw)
                    q=statistics.quantiles(raw,n=4,method='inclusive')
                    calculated={'median':statistics.median(raw),'iqr':q[2]-q[0],
                                'mean':statistics.mean(raw),'min':min(raw),'max':max(raw)}
                    assert calculated==attempt[label]
                    stable=stable and calculated['iqr']<=plan['max_iqr_fraction']*calculated['median']
                    samples+=len(raw)
                if attempt_index<len(round_['attempts'])-1:assert not stable
            assert stable==round_['stable']
        if measurement['status']=='measured':
            assert len(measurement['rounds'])==plan['repeats'] and all(r['stable'] for r in measurement['rounds'])
            for field,label in [('e2e_median_ms','e2e_ms'),('stream_elapsed_median_ms','stream_elapsed_ms')]:
                assert measurement[field]==statistics.median(r['attempts'][-1][label]['median'] for r in measurement['rounds'])
            timed+=1
result={'format':'kiln-policy-search-measurement-audit/1','status':'passed','phase':data['phase'],
        'membership_sha256':manifest['membership_sha256'],'graphs':len(expected),
        'distinct_measured_graph_executables':timed,'measurement_statuses':dict(status),
        'raw_timing_samples_verified':samples,'source_revision':bundle['source_revision'],
        'scope':'Frozen source/artifact identity, collected bytes, aliases and raw timing summaries; reference correctness is the recorded original-input checker outcome'}
with args.output.open('x') as stream:json.dump(result,stream,indent=2);stream.write('\n')
print(json.dumps(result,indent=2))
