#!/usr/bin/env python3
"""Execute the unchanged original runner with explicit local provider settings."""
import argparse,hashlib,json,subprocess,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--run-id',default='v1',choices=['v1','v2','v3','v4','v5']);parser.add_argument('--dataset',type=Path);a=parser.parse_args();root=a.root.resolve();run_id=a.run_id;receipt=root/('original-agent-smoke-'+run_id+'.json');assert not receipt.exists()
assert json.loads((root/'model-api-probe-v1.json').read_text())['status']=='complete'
assert json.loads((root/'agent-locked-import-v2.json').read_text())['status']=='complete'
source=root/'passnet-pristine/pass_agent';dataset=a.dataset or root/'passagent-shipping-smoke.jsonl'
assert dataset.is_file(),dataset
if run_id in ['v4','v5']:
 image=json.loads((root/'agent-image-shell-v5.json').read_text());assert image['status']=='complete' and image['source_layers_identical'];assert json.loads(dataset.read_text())['docker_image']==image['tag']
assert (source/'tools/file_editor.py').is_file() and (source/'tools/pass_evaluator.py').is_file()
output=root/('original-agent-smoke-'+run_id);output.mkdir()
command=[str(root/'agent-locked-venv/bin/python'),str(source/'examples/run_pass_agent_demo.py'),'--llm-name','openai/Qwen3-30B-A3B','--llm-base-url','http://127.0.0.1:8041/v1','--openai-api-key','EMPTY','--anthropic-api-key','EMPTY','--dataset',str(dataset),'--config',str(source/'configs'),'--max-steps','50','--k','1','--temperature','0','--max-workers','1','--traj-dir',str(output),'--exp-name','original-shipping-smoke-'+run_id]
environment={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/home/manuel','LANG':'C.UTF-8','PYTHONUNBUFFERED':'1','PYTHONPATH':str(source.parent)+':'+str(source),'LLM_BASE_URL':'http://127.0.0.1:8041/v1','OPENAI_API_KEY':'EMPTY','ANTHROPIC_API_KEY':'EMPTY','MAX_WORKERS':'1'}
state={'format':'kiln-original-passagent-smoke/1','status':'running','cwd':str(source),'command':command,'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'dataset_sha256':hashlib.sha256(dataset.read_bytes()).hexdigest(),'population':'Shipping one-task/one-graph operational smoke, separate from official200/2060','model_context':40960,'original_runner_max_tokens':131072,'timing_condition':'Local BF16 model resident on same DGX; inference and evaluator serial within agent; no isolated compiler timing claim','results':[]}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
save();start=time.monotonic()
try:
 with (root/('original-agent-smoke-'+run_id+'.log')).open('x') as log:r=subprocess.run(command,cwd=source,env=environment,stdout=log,stderr=subprocess.STDOUT)
 state['returncode']=r.returncode
 for file in sorted(output.glob('*.jsonl')):
  lines=file.read_text().splitlines();state['results'].append({'path':str(file),'bytes':file.stat().st_size,'lines':len(lines),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
 trajectories=output/('original-shipping-smoke-'+run_id+'.jsonl')
 state['status']='complete' if r.returncode==0 and trajectories.exists() and trajectories.stat().st_size else 'failed'
 if state['status']=='failed':state['error']='Original runner failed or emitted no trajectory; inspect complete original log'
except Exception as error:state.update(status='failed',error=str(error));raise
finally:state['elapsed_seconds']=time.monotonic()-start;save();print(json.dumps(state,indent=2),flush=True)
