#!/usr/bin/env python3
"""Convert a fully verified original checkpoint, preserving unquantized tensor types."""
import argparse, collections, hashlib, json, subprocess, time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);root=parser.parse_args().root.resolve()
receipt=root/'model-conversion-v1.json'
if receipt.exists():raise ValueError('Preserve existing conversion receipt')
assert json.loads((root/'model-download-v1.json').read_text())['status']=='complete'
assert json.loads((root/'converter-environment-v2.json').read_text())['status']=='complete'
output=root/'model-converted/Qwen3-30B-A3B-BF16.gguf';output.parent.mkdir(exist_ok=True)
assert not output.exists()
python=root/'converter-venv/bin/python';source=root/'llama-src'
command=[str(python),str(source/'convert_hf_to_gguf.py'),str(root/'model-original'),'--outfile',str(output),'--outtype','bf16']
state={'format':'kiln-original-model-conversion/1','status':'running','command':command,'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'output':str(output),'precision':'unquantized BF16 weights; F32 auxiliary tensors permitted'}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
save();start=time.monotonic()
try:
 with (root/'model-conversion-v1.log').open('x') as log:r=subprocess.run(command,cwd=source,stdout=log,stderr=subprocess.STDOUT)
 state['returncode']=r.returncode
 if r.returncode:raise RuntimeError('Converter returned '+str(r.returncode))
 inspect_code='import collections,json,gguf,sys; r=gguf.GGUFReader(sys.argv[1]); counts=collections.Counter(t.tensor_type.name for t in r.tensors); assert set(counts)<= {"BF16","F32"},counts; print(json.dumps({"tensor_types":dict(counts),"tensor_count":len(r.tensors),"tensor_elements":sum(int(t.n_elements) for t in r.tensors)}))'
 result=subprocess.run([str(python),'-c',inspect_code,str(output)],check=True,capture_output=True,text=True)
 state['inspection']=json.loads(result.stdout)
 digest=hashlib.sha256()
 with output.open('rb') as file:
  for chunk in iter(lambda:file.read(16*1024*1024),b''):digest.update(chunk)
 state.update(status='complete',output_bytes=output.stat().st_size,output_sha256=digest.hexdigest())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:state['elapsed_seconds']=time.monotonic()-start;save();print(json.dumps(state,indent=2),flush=True)
