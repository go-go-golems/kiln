#!/usr/bin/env python3
"""Pin public agent-runtime sources and inspect original model weight formats."""
import hashlib,json,subprocess,urllib.request
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/agent-runtime-bootstrap-v1';p.mkdir(exist_ok=True)
result={'scope':'Read-only source/model metadata discovery; no weights or inference yet','git':{},'models':{},'downloads':[]}
for name,url in [('llama.cpp','https://github.com/ggml-org/llama.cpp.git'),('r2e-gym','https://github.com/R2E-Gym/R2E-Gym.git')]:
 r=subprocess.run(['git','ls-remote',url,'HEAD'],capture_output=True,text=True);result['git'][name]={'url':url,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
for model in ['Qwen/Qwen3-30B-A3B','Qwen/Qwen3-30B-A3B-GGUF']:
 url='https://huggingface.co/api/models/'+model+'?blobs=true'
 try:
  with urllib.request.urlopen(url,timeout=45) as response:raw=response.read()
  data=json.loads(raw);filename=model.split('/')[-1]+'-metadata.json';(p/filename).write_bytes(raw)
  result['models'][model]={'sha':data.get('sha'),'file':filename,'sha256':hashlib.sha256(raw).hexdigest(),'weight_files':[{k:sibling[k] for k in ['rfilename','size','lfs'] if k in sibling} for sibling in data.get('siblings',[]) if sibling['rfilename'].endswith(('.gguf','.safetensors'))]}
 except Exception as error:result['models'][model]={'error':str(error)}
for relative in ['docs/build.md','docs/function-calling.md','tools/server/README.md','LICENSE']:
 head=result['git']['llama.cpp'];revision=head['stdout'].split()[0] if head['returncode']==0 else None
 if not revision:continue
 url='https://raw.githubusercontent.com/ggml-org/llama.cpp/'+revision+'/'+relative
 try:
  with urllib.request.urlopen(url,timeout=45) as response:raw=response.read()
  filename='llama-'+relative.replace('/','-');(p/filename).write_bytes(raw)
  result['downloads'].append({'url':url,'file':filename,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
 except Exception as error:result['downloads'].append({'url':url,'error':str(error)})
with (p/'discovery.json').open('x') as file:file.write(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
