#!/usr/bin/env python3
"""Record import deltas and freeze every newly complete source-GELU family."""
import collections,hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';up=s/'upstream'
old=json.loads((s/'import-audit-after-reshape.json').read_text());new=json.loads((s/'import-audit-after-gelu.json').read_text())
before={r['graph']:r for r in old['records']};after={r['graph']:r for r in new['records']}
assert before.keys()==after.keys()
regressions=[g for g in before if before[g]['status']=='imported' and after[g]['status']!='imported']
if regressions:raise ValueError('Import regressions: '+repr(regressions))
groups=collections.defaultdict(list)
for row in new['records']:groups[row['sample']].append(row)
samples=(up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines();tasks=[]
for sample,rows in groups.items():
 if all(r['status']=='imported' for r in rows) and any(before[r['graph']]['status']!='imported' for r in rows):
  content=(up/sample/'graph_list.txt').read_bytes();assert content.decode().splitlines()==[r['graph'] for r in rows]
  tasks.append({'index':samples.index(sample),'sample':sample,'graphs':len(rows),'graph_list_sha256':hashlib.sha256(content).hexdigest()})
delta={'old_imports':sum(r['status']=='imported' for r in before.values()),'new_imports':sum(r['status']=='imported' for r in after.values()),'newly_imported':sum(before[g]['status']!='imported' and after[g]['status']=='imported' for g in before),'regressions':regressions,'newly_complete_tasks':tasks,'scope':'Import eligibility only; not execution acceptance'}
(s/'gelu-import-delta.json').write_text(json.dumps(delta,indent=2)+'\n')
plan={'format':'kiln-task-plan/1','selection':'All newly complete import families after exact/tanh GELU source binding; no shape/dtype filtering; operation-support qualification, not fresh-model optimization confirmation','nominal_tolerance':-5,'target':'a100','hardware':'DGX Spark GB10; exploratory modified integration protocol','contraction':'separate','audit_sha256':{n:hashlib.sha256((s/n).read_bytes()).hexdigest() for n in ['import-audit-after-reshape.json','import-audit-after-gelu.json']},'tasks':tasks}
output=s/'gelu-source-cohort-plan.json'
with output.open('x') as file:file.write(json.dumps(plan,indent=2)+'\n')
summary={'tasks':len(groups),'graphs':len(new['records']),'graphs_imported':delta['new_imports'],'tasks_fully_imported':[{'task':sample,'graphs':len(rows)} for sample,rows in groups.items() if all(row['status']=='imported' for row in rows)],'scope':'Import eligibility only; not original benchmark acceptance'}
(s/'import-audit-after-gelu-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(delta['newly_imported'],'new imports;',len(tasks),'new complete families;',sum(r['graphs'] for r in tasks),'variants')
