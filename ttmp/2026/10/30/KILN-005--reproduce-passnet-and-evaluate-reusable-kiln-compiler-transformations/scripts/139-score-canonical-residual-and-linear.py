#!/usr/bin/env python3
"""Score preserved GPU logs locally with the unchanged original scorer."""
import subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];kiln=p.parents[4];sources=p/'sources'
for name,log,sample in [('canonical-residual-score','fourth-task-canonical-priority-fixed.log',12),('linear-original-score','seventh-task-original-evaluator.log',122)]:
 output=sources/name;output.mkdir(exist_ok=False)
 with (output/'invocation.log').open('w') as out:
  subprocess.run([sys.executable,str(kiln/'integrations/passnet/score_task.py'),'--log',str(sources/log),'--output',str(output/'score.json'),'--sample-id',str(sample),'--upstream',str(sources/'upstream')],stdout=out,stderr=subprocess.STDOUT,check=True)
 print(name,(output/'score.json').read_text().strip())
