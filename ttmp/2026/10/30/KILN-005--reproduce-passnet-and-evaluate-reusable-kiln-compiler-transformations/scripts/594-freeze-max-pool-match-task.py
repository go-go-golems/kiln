"""Freeze task107's complete 18-graph membership for matcher confirmation."""
import json
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';plan=json.loads((s/'parallel-port-task-plan-v1.json').read_text());tasks=[r for r in plan['tasks'] if r['index']==107]
assert len(tasks)==1 and tasks[0]['graphs']==18
plan['selection']='Task107 exact complete-family matcher confirmation after max_pool2d normalization';plan['tasks']=tasks
with (s/'max-pool-match-task-plan-v1.json').open('x') as f:json.dump(plan,f,indent=2);f.write('\n')
print(tasks)
