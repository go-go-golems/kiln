#!/usr/bin/env python3
"""Freeze a fresh policy-development/confirmation corpus from official train sources.

No policy or timing feedback enters eligibility. One selected graph per task and
per exact source model; fixed model hash assigns the split. Every scan outcome
is recorded, including unsupported operations and exhausted quotas.
"""
import hashlib,json,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(r for r in p.parents if (r/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import FORMAT,translate_graph
root=p/'sources/upstream';out=p/'sources/policy-corpus-v3';out.mkdir(exist_ok=True)
if (out/'manifest.json').exists():raise ValueError('Corpus already frozen; use a new version')
prior=json.loads((p/'sources/policy-corpus-v2/manifest.json').read_text())
model_of=lambda graph:'/'.join(graph.split('/samples/',1)[1].split('/')[:2])
coverage=json.loads((p/'sources/kiln-coverage.json').read_text())
old_graphs={graph for r in coverage['records'] for graph in r['graph_results']}
old_models={model_of(r['graph']) for r in prior['variants']}|{model_of(graph) for graph in old_graphs}
old_sources={r['source_sha256'] for r in prior['variants']}
train_list=root/'sample_lists/train/hf_fusible_train_samples_v2.txt'
samples=sorted(train_list.read_text().splitlines(),key=lambda x:hashlib.sha256(x.encode()).hexdigest())
quotas={'train':12,'heldout':8};counts={key:0 for key in quotas};models=set();hashes=set(old_sources);records=[];audit=[]
for sample_index,sample in enumerate(samples[:2048]):
 list_path=root/sample/'graph_list.txt'
 if not list_path.exists():audit.append({'sample':sample,'status':'missing_graph_list'});continue
 paths=[s for s in list_path.read_text().splitlines() if '/float32/' in s][:8]
 if not paths:audit.append({'sample':sample,'status':'no_fp32_variant_in_scan'});continue
 for graph in paths:
  model=model_of(graph);split='heldout' if int(hashlib.sha256(model.encode()).hexdigest(),16)%5<2 else 'train'
  row={'sample':sample,'graph':graph,'model':model,'split':split}
  if graph in old_graphs or model in old_models:row['status']='prior_observation_excluded'
  elif model in models:row['status']='model_already_selected'
  elif counts[split]>=quotas[split]:row['status']='split_quota_full'
  else:
   try:
    source=(root/graph/'model.py').read_text()
    if any(op in source for op in ['conv2d','matmul','embedding','functional.linear']):
     row['status']='heavy_or_unqualified_operation_excluded'
    else:
     result=translate_graph(root,graph,'fake')
     elements=0
     for shape in result['inputs'].values():
      count=1
      for dim in shape:count*=dim
      elements+=count
     digest=hashlib.sha256(result['script'].encode()).hexdigest()
     if set(result['input_dtypes'].values())!={'f32'}:row['status']='mixed_or_non_fp32'
     elif elements>2000000:row['status']='input_volume_excluded'
     elif digest in hashes:row['status']='duplicate_program_excluded'
     else:
      filename=f'{len(records):03d}.kiln.js';(out/filename).write_text(result['script'])
      records.append({'graph':graph,'sample':sample,'split':split,'model':model,'script':filename,'source_sha256':digest,'input_elements':elements,
       'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],'output_structure':result['output_structure']})
      hashes.add(digest);models.add(model);counts[split]+=1;row['status']='selected'
   except Exception as error:row.update(status='unsupported',error_type=type(error).__name__,error=str(error))
  audit.append(row)
  if row['status']=='selected':print('SELECT',split,counts[split],model,graph,flush=True);break
 (out/'scan-audit.json').write_text(json.dumps({'counts':counts,'tasks_scanned':sample_index+1,'records':audit},indent=2)+'\n')
 if all(counts[key]>=quotas[key] for key in quotas):break
if not all(counts[key]>=quotas[key] for key in quotas):raise ValueError(f'Insufficient eligible fresh workloads: {counts}; preserve audit and revise a new version explicitly')
assert not ({r['model'] for r in records if r['split']=='train'}&{r['model'] for r in records if r['split']=='heldout'})
identity=hashlib.sha256(json.dumps(records,sort_keys=True).encode()).hexdigest()
manifest={'format':FORMAT,'sample':'fresh-policy-corpus-v3','membership_sha256':identity,'selection':
 'Official train list sorted by SHA256(task); first eligible FP32 graph per task/model; source-model hash assigns confirmation 2/5; 12 train +8 confirmation; <=2M inputs; no prior models/program hashes; no timing feedback',
 'source_sample_list':'sample_lists/train/hf_fusible_train_samples_v2.txt','source_sample_list_sha256':hashlib.sha256(train_list.read_bytes()).hexdigest(),
 'prior_models_excluded':sorted(old_models),'scope':'Policy confirmation drawn from official training sources; not an untouched paper evaluation benchmark','variants':records}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('FROZEN',counts,identity,flush=True)
