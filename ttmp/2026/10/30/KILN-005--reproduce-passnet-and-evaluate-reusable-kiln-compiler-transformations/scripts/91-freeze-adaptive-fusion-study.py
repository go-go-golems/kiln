#!/usr/bin/env python3
"""Reuse development training graphs and reserve eight new confirmation models.

The 12 generated proposals are fixed from training traces before confirmation
source selection. No candidate timing or confirmation trace enters the generator.
"""
import hashlib
import json
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1];repo=next(p for p in root.parents if (p/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import translate_graph,FORMAT
from propose_policy import propose
from reference_domains import reference_domains
sources=root/'sources';upstream=sources/'upstream';out=sources/'policy-corpus-v4'
if out.exists():raise ValueError('Preserve frozen or partial study directory; investigate instead of overwriting')
out.mkdir()
old=json.loads((sources/'policy-corpus-v3/manifest.json').read_text())
trace=json.loads((sources/'policy-artifacts-v3/default/compile-receipt.json').read_text())
proposals=propose(old,trace)
(out/'proposals.json').write_text(json.dumps(proposals,indent=2)+'\n')
records=[];models=set();hashes=set();volumes=[];audit=[]
model_of=lambda graph:'/'.join(graph.split('/samples/',1)[1].split('/')[:2])
for previous in sorted(sources.glob('policy-corpus-v*/manifest.json')):
 for r in json.loads(previous.read_text())['variants']:
  models.add(model_of(r['graph']));hashes.add(r['source_sha256'])
coverage=json.loads((sources/'kiln-coverage.json').read_text())
for task in coverage['records']:
 for graph in task['graph_results']:models.add(model_of(graph))
for r in old['variants']:
 if r['split']!='train':continue
 text=(sources/'policy-corpus-v3'/r['script']).read_text()
 assert hashlib.sha256(text.encode()).hexdigest()==r['source_sha256']
 script=f'{len(records):03d}.kiln.js';(out/script).write_text(text)
 records.append({**r,'script':script,'provenance':'Reused adaptive development training graph; previous timings were observed'})
assert len(records)==12
sample_list=upstream/'sample_lists/train/hf_fusible_train_samples_v2.txt'
samples=sorted(sample_list.read_text().splitlines(),key=lambda x:hashlib.sha256(x.encode()).hexdigest())
count=0
for index,sample in enumerate(samples[:4096]):
 listing=upstream/sample/'graph_list.txt'
 if not listing.exists():audit.append({'sample':sample,'status':'missing_graph_list'});continue
 for graph in [s for s in listing.read_text().splitlines() if '/float32/' in s][:8]:
  model=model_of(graph);row={'sample':sample,'graph':graph,'model':model}
  if model in models:row['status']='previous_or_selected_model_excluded'
  else:
   try:
    text=(upstream/graph/'model.py').read_text()
    if any(op in text for op in ['conv2d','matmul','embedding','functional.linear']):
     row['status']='heavy_or_unqualified_operation_excluded'
    else:
     result=translate_graph(upstream,graph,'fake');elements=sum(__import__('math').prod(s) for s in result['inputs'].values())
     sizes=[__import__('math').prod(n['shape']) for n in result['tensor_nodes'].values()]
     digest=hashlib.sha256(result['script'].encode()).hexdigest()
     if set(result['input_dtypes'].values())!={'f32'}:row['status']='mixed_or_non_fp32'
     elif elements>2000000 or not sizes or max(sizes)>8000000 or sum(sizes)>64000000 or len(sizes)>128:row['status']='volume_excluded'
     elif digest in hashes:row['status']='previous_or_duplicate_program_excluded'
     else:
      script=f'{len(records):03d}.kiln.js';(out/script).write_text(result['script'])
      records.append({'graph':graph,'sample':sample,'split':'heldout','model':model,'script':script,'source_sha256':digest,'input_elements':elements,'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],'output_structure':result['output_structure'],'provenance':'Fresh confirmation exact model and generated source relative to prior policy studies'})
      volumes.append({'graph':graph,'max_tensor_elements':max(sizes),'all_tensor_elements':sum(sizes),'tensor_nodes':len(sizes)})
      models.add(model);hashes.add(digest);count+=1;row['status']='selected'
   except Exception as error:row.update(status='unsupported',error_type=type(error).__name__,error=str(error))
  audit.append(row)
  if row['status']=='selected':print('Reserved confirmation',count,'of 8',flush=True);break
 (out/'scan-audit.json').write_text(json.dumps({'tasks_scanned':index+1,'records':audit},indent=2)+'\n')
 if count==8:break
if count!=8:raise ValueError(f'Only {count} eligible fresh confirmation models; preserve partial audit')
identity=hashlib.sha256(json.dumps(records,sort_keys=True).encode()).hexdigest()
manifest={'format':FORMAT,'sample':'adaptive-policy-corpus-v4','membership_sha256':identity,'selection':'Twelve reused adaptive development training graphs; first eight eligible fresh exact models/program hashes in SHA256(task) order from official training list; fixed metadata envelope; no new timing feedback','source_sample_list':'sample_lists/train/hf_fusible_train_samples_v2.txt','source_sample_list_sha256':hashlib.sha256(sample_list.read_bytes()).hexdigest(),'scope':'Adaptive training study with new exact-model confirmation; not untouched paper evaluation or architecture-family-independent split','variants':records}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'reference-domains.json').write_text(json.dumps(reference_domains(out,upstream),indent=2)+'\n')
(out/'confirmation-volume-audit.json').write_text(json.dumps(volumes,indent=2)+'\n')
policies=out/'policies';policies.mkdir()
for policy in proposals['policies']:(policies/(policy['id']+'.json')).write_text(json.dumps(policy,indent=2)+'\n')
plan=json.loads((sources/'policy-corpus-v3/measurement-plan.json').read_text())
plan.update(membership_sha256=identity,candidate_ids=[r['id'] for r in proposals['policies']],
 selection='Training-only family-balanced geometric mean end-to-end speedup; exact ties preserve candidate order, unchanged baseline first; compile-cost coefficient 0',
 scope=manifest['scope'],proposal_provenance='Deterministic template synthesis authored by Codex; training feature quantiles only; no external LLM invocation; adaptive training reuse explicit')
(out/'measurement-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print('FROZEN 12 adaptive train +8 fresh confirmation; 12 candidates;',identity,flush=True)
