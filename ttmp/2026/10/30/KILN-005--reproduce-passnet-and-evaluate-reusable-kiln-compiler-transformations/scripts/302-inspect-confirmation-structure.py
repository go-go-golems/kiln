#!/usr/bin/env python3
"""Inspect fixed confirmation artifacts for the next compiler investigation, without tuning."""
import hashlib,json,re
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';artifacts=s/'reshape-confirmation-artifacts-v2'
read=lambda path:json.loads(path.read_text())
summary=read(s/'reshape-confirmation-measurements-v2-summary.json');qualification=read(artifacts/'pair-qualification.json')
assert summary['qualified']
records=[]
for index,row in enumerate(summary['records']):
    result={key:row[key] for key in ['graph','model','category','e2e_speedup','stream_speedup']};variants={}
    for role in ['baseline','candidate']:
        q=qualification['records'][role][index];path=artifacts/role/q['artifact'];raw=path.read_bytes()
        assert hashlib.sha256(raw).hexdigest()==q['artifact_sha256']
        a=json.loads(raw);variants[role]={'kernel_count':len(a['kernels']),'buffer_count':len(a['buffers']),'kernels':[{key:k.get(key) for key in ['row','grid','block','smemBytes','dispatch','shape','inShapes','inDtypes']} for k in a['kernels']], 'cuda_bodies':[re.sub(r'void k_[A-Za-z0-9_]+\(', 'void kernel(',k['cuda']) for k in a['kernels']]}
    result['kernel_count_changed']=variants['baseline']['kernel_count']!=variants['candidate']['kernel_count']
    result['schedule_or_layout_changed']=variants['baseline']['kernels']!=variants['candidate']['kernels']
    result['cuda_bodies_equal_ignoring_entry_names']=variants['baseline']['cuda_bodies']==variants['candidate']['cuda_bodies']
    for variant in variants.values():del variant['cuda_bodies']
    result['variants']=variants;records.append(result)
out={'format':'kiln-confirmation-structural-inspection/1','scope':'Post-confirmation descriptive inspection; no candidate changes, no generated-code execution or causal performance attribution','records':records}
(s/'reshape-confirmation-structural-inspection-v2.json').write_text(json.dumps(out,indent=2)+'\n')
for row in sorted(records,key=lambda r:r['e2e_speedup'],reverse=True):
    print(f"{row['e2e_speedup']:.6f}x kernels={row['variants']['baseline']['kernel_count']}->{row['variants']['candidate']['kernel_count']} schedule/layout={row['schedule_or_layout_changed']} same_cuda={row['cuda_bodies_equal_ignoring_entry_names']} {row['model']}")
