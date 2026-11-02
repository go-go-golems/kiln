#!/usr/bin/env python3
"""Launch one pinned local-only GPU server after verified conversion."""
import argparse,hashlib,json,socket,subprocess,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);root=parser.parse_args().root.resolve();receipt=root/'model-server-v1.json'
assert not receipt.exists();conversion=json.loads((root/'model-conversion-v1.json').read_text());assert conversion['status']=='complete'
assert set(conversion['inspection']['tensor_types'])<= {'BF16','F32'}
with socket.socket() as sock:
 try:sock.bind(('127.0.0.1',8041))
 except OSError:raise RuntimeError('Port8041 already owned; do not replace another server')
image='sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba'
args=['/storage/llama-build/bin/llama-server','--model','/storage/model-converted/Qwen3-30B-A3B-BF16.gguf','--alias','Qwen3-30B-A3B','--host','127.0.0.1','--port','8041','--ctx-size','40960','--parallel','1','--jinja','--chat-template-kwargs','{"enable_thinking":true}','--n-gpu-layers','all','--sleep-idle-seconds','-1']
command=['docker','run','--rm','--name','kiln005-qwen-original-server-v1','--gpus','all','--network','host','-v',str(root)+':/storage:ro','--entrypoint',args[0],image]+args[1:]
state={'format':'kiln-original-model-server/1','status':'starting','driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'command':command,'model_sha256':conversion['output_sha256'],'context':40960,'thinking':True,'sleep_idle_seconds':-1,'timing_condition':'Model remains resident; no isolated compiler measurements while server active'}
receipt.write_text(json.dumps(state,indent=2)+'\n')
with (root/'model-server-v1.log').open('x') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
state.update(status='exited',returncode=r.returncode);receipt.write_text(json.dumps(state,indent=2)+'\n');raise SystemExit(r.returncode)
