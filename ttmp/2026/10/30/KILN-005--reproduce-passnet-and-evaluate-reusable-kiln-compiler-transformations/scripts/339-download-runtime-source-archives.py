#!/usr/bin/env python3
"""Archive complete pinned runtime/framework source trees without altering upstream code."""
import hashlib,json,urllib.request
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/agent-runtime-bootstrap-v1';discovery=json.loads((p/'discovery.json').read_text());records=[]
for key,repository in [('llama.cpp','ggml-org/llama.cpp'),('r2e-gym','R2E-Gym/R2E-Gym')]:
 revision=discovery['git'][key]['stdout'].split()[0];url='https://codeload.github.com/'+repository+'/tar.gz/'+revision;path=p/(key+'-source.tar.gz')
 if path.exists():raise ValueError('Preserve source archive')
 with urllib.request.urlopen(url,timeout=60) as response:raw=response.read()
 path.write_bytes(raw);records.append({'name':key,'revision':revision,'url':url,'file':path.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
with (p/'source-archives.json').open('x') as file:file.write(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
