"""Replay the frozen transformed artifacts through the existing original evaluator."""
import json,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'kiln/integrations/passnet'))
from evaluate_tasks import snapshot
bundle=json.loads((root/'bundle.json').read_text());initial=snapshot(root/'kiln')
assert initial==bundle['source_snapshot']
assert not subprocess.check_output(['nvidia-smi','--query-compute-apps=pid','--format=csv,noheader'],text=True).strip()
result={'format':'kiln-task-run/1','status':'running','plan':bundle['plan'],'source_snapshot':initial,
 'scope':'Fixed pointwise-plus-staged candidate on the previously measured six-graph development family; original evaluator numerical curve and scorer retained.','records':[]}
case=bundle['plan']['tasks'][0]
row={'index':case['index'],'sample':case['sample'],'graphs_expected':case['graphs'],'directory':'task-101','status':'running','phases':[]};result['records'].append(row)
receipt=root/'results/run.json'
def save():receipt.write_text(json.dumps(result,indent=2)+'\n')
def docker(command):return ['docker','run','--rm','--gpus','all','-v',str(root)+':/work','-w','/work/kiln/integrations/passnet','--entrypoint','python','sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba',*command]
base='/work/results/task-101'
commands=[('evaluate',docker(['run_task.py','--directory',base+'/corpus','--upstream','/work/upstream','--pass-directory',base+'/passes','--log',base+'/benchmark.log','--warmup','20','--trials','100'])),
 ('score',docker(['score_task.py','--log',base+'/benchmark.log','--sample-id','102','--upstream','/work/upstream','--output',base+'/score.json']))]
save()
for phase,command in commands:
 assert snapshot(root/'kiln')==initial
 started=time.monotonic();row['current_phase']=phase;save()
 with (root/'results/task-101'/f'{phase}.log').open('w') as log:p=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 row['phases'].append({'phase':phase,'returncode':p.returncode,'elapsed_seconds':time.monotonic()-started,'command':command});save()
 if p.returncode:row.update(status='phase_failed',failed_phase=phase);break
else:row['status']='process_complete'
result['status']='complete';save()
