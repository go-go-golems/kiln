#!/usr/bin/env python3
"""DGX owner process: verify bundle, serve pinned model, run batch, release GPU."""
import hashlib
import importlib
import json
import re
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

root=Path(__file__).resolve().parent
bootstrap=Path('/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1')
manifest=json.loads((root/'bundle.json').read_text())
receipt=root/'run.json'
if receipt.exists():raise RuntimeError('Preserve existing run')
config=manifest['run']
assert re.fullmatch('[a-z0-9-]+',config['name'])
state={'format':'kiln-native-agent-owned-batch/1','status':'verifying','source_revision':manifest['source_revision'],
       'scope':'Declared external-model proposal batch; no performance claim',
       'framework_revision':manifest['framework_revision']}
def save():
    temp=receipt.with_suffix('.tmp');temp.write_text(json.dumps(state,indent=2)+'\n');temp.replace(receipt)
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
save()
server=None
name='kiln005-'+config['name']
image='sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba'
try:
    for relative,want in manifest['files_sha256'].items():
        assert digest(root/relative)==want,relative
    protocol=json.loads((root/'inputs/protocol.json').read_text())
    search=next(s for s in protocol['searches'] if s['id']==config['id'])
    assert config=={'name':config['name'],'proposal_budget':protocol['proposal_budget'],**search}
    assert config['model']=='Qwen3-30B-A3B','Owner has one explicitly pinned model'
    state['framework_files']={}
    for module,want in manifest['framework_files_sha256'].items():
        path=Path(importlib.import_module(module).__file__)
        assert digest(path)==want,module
        state['framework_files'][module]={'path':str(path),'sha256':want}
    state['node']=subprocess.check_output(['/usr/local/bin/node','--version'],text=True).strip()
    conversion=json.loads((bootstrap/'model-conversion-v1.json').read_text())
    model=bootstrap/'model-converted/Qwen3-30B-A3B-BF16.gguf'
    state['status']='verifying_model';save()
    assert digest(model)==conversion['output_sha256'],'Pinned model bytes changed'
    state['model_sha256']=conversion['output_sha256']
    state['server_sha256']=digest(bootstrap/'llama-build/bin/llama-server')
    active=subprocess.check_output(['nvidia-smi','--query-compute-apps=pid,process_name,used_gpu_memory','--format=csv,noheader'],text=True).strip()
    assert not active,'GPU compute activity present; do not disturb it: '+active
    assert subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0,'Container name already exists'
    with socket.socket() as sock:sock.bind(('127.0.0.1',8041))
    command=['docker','run','--rm','--name',name,'--gpus','all','--network','host',
             '-v',str(bootstrap)+':/storage:ro','--entrypoint','/storage/llama-build/bin/llama-server',image,
             '--model','/storage/model-converted/Qwen3-30B-A3B-BF16.gguf','--alias','Qwen3-30B-A3B',
             '--host','127.0.0.1','--port','8041','--ctx-size','40960','--parallel','1','--jinja',
             '--chat-template-kwargs','{"enable_thinking":true}','--n-gpu-layers','all','--sleep-idle-seconds','-1']
    state.update(status='starting_model',server_command=command);save()
    with (root/'model-server.stdout.txt').open('x') as log:
        server=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
        state['server_process_pid']=server.pid;save()
        deadline=time.monotonic()+180
        while time.monotonic()<deadline:
            if server.poll() is not None:raise RuntimeError('Owned model server exited during startup')
            try:
                with urlopen('http://127.0.0.1:8041/health',timeout=2) as response:
                    health=json.load(response)
                if health.get('status')=='ok':break
            except (OSError,ValueError):pass
            time.sleep(1)
        else:raise RuntimeError('Model health deadline exceeded')
        container=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
        assert container['Image']==image
        state['container_id']=container['Id']
        with urlopen('http://127.0.0.1:8041/v1/models',timeout=5) as response:state['provider_models']=json.load(response)
        command=[sys.executable,str(root/'repo/integrations/passnet/run_native_policy_agent.py'),
                 '--manifest',str(root/'inputs/manifest.json'),'--receipt',str(root/'inputs/receipt.json'),
                 '--output',str(root/'output'),'--base-url','http://127.0.0.1:8041/v1',
                 '--model','Qwen3-30B-A3B','--node','/usr/local/bin/node',
                 '--proposal-budget',str(config['proposal_budget']),'--max-steps',str(config['max_steps']),
                 '--completion-budget',str(config['completion_budget']),'--per-turn-tokens',str(config['per_turn_tokens']),
                 '--timeout','180']
        state.update(status='running_agent',agent_command=command);save()
        with (root/'agent.stdout.txt').open('x') as agentlog:
            result=subprocess.run(command,stdout=agentlog,stderr=subprocess.STDOUT)
        state['agent_returncode']=result.returncode
        result_path=root/'output/agent/result.json'
        state['agent_result']=json.loads(result_path.read_text()) if result_path.exists() else None
        # Zero valid proposals is a legitimate search outcome, not infrastructure failure.
        state['status']='complete' if result.returncode==0 and state['agent_result'] else 'failed'
except Exception as error:
    state.update(status='failed',error=str(error),error_type=type(error).__name__)
finally:
    if server is not None:
        inspected=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
        if inspected.returncode==0:
            container=json.loads(inspected.stdout)[0]
            if container['Image']==image and container['Config']['Cmd']==state['server_command'][state['server_command'].index(image)+1:]:
                stopped=subprocess.run(['docker','stop','--time','30',container['Id']],capture_output=True,text=True)
                state['release']={'container_id':container['Id'],'returncode':stopped.returncode,'stdout':stopped.stdout,'stderr':stopped.stderr}
            else:state['release']={'error':'Owned container identity mismatch; did not stop'}
        else:state['release']={'already_absent':True}
        try:state['server_returncode']=server.wait(timeout=40)
        except subprocess.TimeoutExpired:state['release']['error']='Docker owner process still live'
        state['container_absent']=subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0
        state['gpu_processes_after']=subprocess.check_output(['nvidia-smi','--query-compute-apps=pid,process_name,used_gpu_memory','--format=csv,noheader'],text=True).strip()
    save()
    print(json.dumps(state,indent=2),flush=True)
if state['status']!='complete':raise SystemExit(1)
