#!/usr/bin/env python3
"""Freeze the complete canonical evaluation membership and original BF16 checkpoint."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources';root=p/'agent-runtime-bootstrap-v1';up=p/'upstream';metadata=json.loads((root/'Qwen3-30B-A3B-metadata.json').read_text());discovery=json.loads((root/'discovery.json').read_text())
files=[]
for row in metadata['siblings']:
 name=row['rfilename']
 if name.endswith(('.safetensors','.json','.txt')) or name in ['LICENSE','README.md']:
  files.append({'name':name,'size':row['size'],'sha256':row.get('lfs',{}).get('sha256'),'git_blob_sha1':row['blobId'],'url':'https://huggingface.co/Qwen/Qwen3-30B-A3B/resolve/'+metadata['sha']+'/'+name})
model={'format':'kiln-local-agent-model/1','repository':'Qwen/Qwen3-30B-A3B','revision':metadata['sha'],'weight_policy':'Original BF16 safetensors; convert to unquantized BF16 GGUF, no quantization','files':files,'bytes':sum(row['size'] for row in files)}
with (root/'model-download-plan.json').open('x') as file:file.write(json.dumps(model,indent=2)+'\n')
shipping=[json.loads(line) for line in (up/'pass_agent/datasets/passbench_demo_dataset_200.jsonl').read_text().splitlines()]
evaluation=(up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines();assert len(evaluation)==len(set(evaluation))==200
records=[];members=[]
for index,sample in enumerate(evaluation):
 raw=(up/sample/'graph_list.txt').read_bytes();graphs=raw.decode().splitlines()
 records.append({'swe_type':'passnet','sample_dir':sample,'repo_name':'passnet','docker_image':'kiln005-passagent:torch26.05','instance_id':f'passbench-v2-{index:03d}-'+Path(sample).name[:12]})
 members.append({'index':index,'sample':sample,'graphs':graphs,'graph_list_sha256':hashlib.sha256(raw).hexdigest()})
assert sum(len(row['graphs']) for row in members)==2060
with (root/'passagent-evaluation-200.jsonl').open('x') as file:file.write(''.join(json.dumps(row)+'\n' for row in records))
shipping_counts=[len((up/row['sample_dir']/'graph_list.txt').read_text().splitlines()) for row in shipping]
receipt={'format':'kiln-passagent-membership/1','selection':'Entire official evaluation list in original order; no filtering by Kiln support, graph size or dtype','tasks':200,'graphs':2060,'shipping_demo':{'tasks':len(shipping),'graphs':sum(shipping_counts),'sample_name_overlap':len(set(evaluation)&{row['sample_dir'] for row in shipping})},'manifest_sha256':hashlib.sha256((root/'passagent-evaluation-200.jsonl').read_bytes()).hexdigest(),'model_plan_sha256':hashlib.sha256((root/'model-download-plan.json').read_bytes()).hexdigest(),'members':members}
with (root/'evaluation-membership.json').open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
print('Frozen 200 tasks/2060 graphs; original checkpoint bytes:',model['bytes'])
