#!/usr/bin/env python3
"""Inside the GPU image, repair scoring only after the frozen cohort completes."""
import hashlib,json,subprocess,sys
from pathlib import Path
root=Path('/work/matrix-cohort-v1');run=json.loads((root/'run.json').read_text())
if run['status']!='complete':raise ValueError('Preserve live run; wait for terminal receipt')
receipt=root/'score-recovery.json'
if receipt.exists():raise ValueError('Preserve earlier recovery')
rows=[]
for task in run['records']:
 directory=root/task['directory'];log=directory/'benchmark.log'
 if not log.exists():
  rows.append({'index':task['index'],'status':'not_evaluated','failed_phase':task.get('failed_phase')});continue
 command=[sys.executable,'score_task.py','--log',str(log),'--sample-id',str(task['index']+1),'--upstream','/work/upstream','--output',str(directory/'score.json')]
 with (directory/'score-recovery.log').open('w') as out:result=subprocess.run(command,stdout=out,stderr=subprocess.STDOUT)
 rows.append({'index':task['index'],'status':'scored' if result.returncode==0 else 'failed','returncode':result.returncode,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()})
 print(task['index'],rows[-1]['status'],flush=True)
receipt.write_text(json.dumps({'format':'kiln-cohort-score-recovery/1','scope':'Same original evaluation bytes; filename correction only; no GPU rerun','records':rows},indent=2)+'\n')
if any(r['status']=='failed' for r in rows):raise SystemExit(1)
