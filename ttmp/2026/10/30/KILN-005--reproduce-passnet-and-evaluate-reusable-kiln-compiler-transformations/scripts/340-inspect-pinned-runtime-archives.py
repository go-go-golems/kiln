#!/usr/bin/env python3
"""Extract review-critical source members with parent archive provenance."""
import hashlib,json,tarfile
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/agent-runtime-bootstrap-v1';rows=json.loads((p/'source-archives.json').read_text());records=[]
for row in rows:
 path=p/row['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
 targets=['CMakeLists.txt','common/CMakeLists.txt','tools/server/CMakeLists.txt','requirements/requirements-convert_hf_to_gguf.txt'] if row['name']=='llama.cpp' else ['pyproject.toml','src/r2egym/agenthub/runtime/docker.py','src/r2egym/agenthub/environment/env.py','src/r2egym/agenthub/agent/agent.py']
 with tarfile.open(path) as tar:
  prefix=tar.getnames()[0].split('/')[0]
  for relative in targets:
   member=prefix+'/'+relative
   try:raw=tar.extractfile(member).read()
   except KeyError:records.append({'archive':row['file'],'member':member,'missing':True});continue
   output=p/'review-source'/row['name']/relative;output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(raw)
   records.append({'archive':row['file'],'member':member,'file':str(output.relative_to(p)),'sha256':hashlib.sha256(raw).hexdigest()})
with (p/'review-source-provenance.json').open('x') as file:file.write(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
