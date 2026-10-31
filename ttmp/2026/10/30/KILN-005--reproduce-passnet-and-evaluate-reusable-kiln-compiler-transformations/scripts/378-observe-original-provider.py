#!/usr/bin/env python3
"""A bounded observation of existing jobs; no launch/restart side effects."""
import argparse,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);a=parser.parse_args();assert a.tag.replace('-','').isalnum()
p=Path(__file__).resolve().parents[1];local=p/'sources/agent-runtime-bootstrap-v1'
remote='''
import json,urllib.request,urllib.error,subprocess
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1');result={}
for name in ['model-conversion-v1','model-server-v1','model-api-probe-v1','original-agent-smoke-v1','original-agent-smoke-v2','original-agent-smoke-v4','original-agent-smoke-v5','agent-image-shell-v5']:
 path=p/(name+'.json')
 if path.exists():
  data=json.loads(path.read_text());result[name]={key:data[key] for key in ['status','returncode','error','inspection','output_sha256','results'] if key in data}
  if 'requests' in data:result[name]['requests']=len(data['requests'])
 path=p/(name+'.log')
 if path.exists():result.setdefault(name,{})['tail']=path.read_text(errors='replace').replace('\\r','\\n').splitlines()[-6:]
try:
 with urllib.request.urlopen('http://127.0.0.1:8041/health',timeout=5) as response:result['health']=json.load(response)
except Exception as error:result['health']={'error':str(error)}
print(json.dumps(result,indent=2))
'''
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True)
result={'returncode':r.returncode,'observation':json.loads(r.stdout) if r.returncode==0 else r.stdout,'stderr':r.stderr}
with (local/('provider-observation-'+a.tag+'.json')).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2));raise SystemExit(r.returncode)
