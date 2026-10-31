#!/usr/bin/env python3
"""Read-only runtime/endpoint metadata; never read or serialize credentials."""
import json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1]
code='''import http.client,json,shutil
result={"scope":"Read-only local inference discovery; no credentials inspected","executables":{n:shutil.which(n) for n in ["ollama","vllm","llama-server"]},"endpoints":[]}
for port,path in [(11434,"/api/tags"),(8000,"/v1/models"),(8001,"/v1/models"),(8080,"/v1/models")]:
 row={"port":port,"path":path};connection=http.client.HTTPConnection("127.0.0.1",port,timeout=2)
 try:
  connection.request("GET",path);response=connection.getresponse();row["http_status"]=response.status
  if response.status==200:
   data=json.loads(response.read(1048576));items=data.get("models",data.get("data",[]));row["models"]=[item.get("id",item.get("name")) for item in items[:20]]
 except Exception as error:row["error_type"]=type(error).__name__
 finally:connection.close()
 result["endpoints"].append(row)
print(json.dumps(result))'''
result=json.loads(subprocess.check_output(['ssh','bling.local','python3 -c '+shlex.quote(code)],text=True))
output=p/'sources/local-inference-presence-bling.json'
with output.open('x') as file:file.write(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
