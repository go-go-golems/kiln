"""Collect terminal complete-task evidence and use the existing acceptance audit."""
import json,subprocess,sys
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources'
staging=json.loads((s/'normalized-matcher-task-staging-v1.json').read_text());base=staging['remote']
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
remote='''import json,sys
from pathlib import Path
root=Path(%r)
sys.path.insert(0,str(root/'kiln/integrations/passnet'))
from evaluate_tasks import snapshot
run=json.loads((root/'results/run.json').read_text())
assert run['status']=='complete'
assert snapshot(root/'kiln')==run['source_snapshot']
print(json.dumps({'source_snapshot':run['source_snapshot'],'records':len(run['records'])}))
''' % base
result=subprocess.run(ssh+['python3 -'],input=remote,text=True,capture_output=True,check=True)
observed=json.loads(result.stdout);assert observed['source_snapshot']==staging['source_snapshot']
out=s/'normalized-matcher-task-results-v1';out.mkdir()
subprocess.run(['rsync','-a','-e','ssh -o HostKeyAlias=bling.local','--exclude=__pycache__/','manuel@bling:'+base+'/results/',str(out)+'/'],check=True)
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local','manuel@bling:'+base+'/owner.log',str(s/'normalized-matcher-task-owner-v1.log')],check=True)
subprocess.run([sys.executable,'integrations/passnet/summarize_task_run.py','--directory',str(out),'--upstream',str(s/'upstream'),'--output',str(s/'normalized-matcher-task-audit-v1.json')],check=True)
