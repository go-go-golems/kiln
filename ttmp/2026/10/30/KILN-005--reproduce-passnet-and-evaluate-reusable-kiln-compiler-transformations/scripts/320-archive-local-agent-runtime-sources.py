#!/usr/bin/env python3
"""Archive primary serving references before deciding how to provision PassAgent."""
import hashlib,json,urllib.request
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/local-agent-runtime-primary-v1';p.mkdir(exist_ok=True)
urls={'nvidia-llama-cpp-dgx-playbook.md':'https://raw.githubusercontent.com/NVIDIA/dgx-spark-playbooks/main/nvidia/llama-cpp/README.md','llama-cpp-dgx-benchmarks.md':'https://raw.githubusercontent.com/ggml-org/llama.cpp/master/benches/dgx-spark/dgx-spark.md','qwen3-30b-a3b-model-card.md':'https://huggingface.co/Qwen/Qwen3-30B-A3B/raw/main/README.md'}
records=[]
for filename,url in urls.items():
 record={'file':filename,'url':url}
 try:
  with urllib.request.urlopen(url,timeout=45) as response:raw=response.read();record['resolved_url']=response.url
  with (p/filename).open('xb') as file:file.write(raw)
  record.update(status='downloaded',sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
 except Exception as error:record.update(status='failed',error=str(error))
 records.append(record)
with (p/'provenance.json').open('x') as file:file.write(json.dumps({'scope':'Primary runtime feasibility references only; no inference, model download or serving system provisioned by this script','records':records},indent=2)+'\n')
print(json.dumps(records,indent=2))
