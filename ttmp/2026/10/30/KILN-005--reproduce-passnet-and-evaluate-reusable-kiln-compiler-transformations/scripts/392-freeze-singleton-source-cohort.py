#!/usr/bin/env python3
"""Retain the full audit delta and all newly complete families, without dtype filtering."""
import collections,hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';up=s/'upstream'
old=json.loads((s/'import-audit-after-gelu.json').read_text());new=json.loads((s/'import-audit-after-singleton-views.json').read_text())
key=lambda row:(row['sample'],row['graph']);before={key(r):r for r in old['records']};after={key(r):r for r in new['records']}
assert len(before)==len(old['records']) and len(after)==len(new['records']) and before.keys()==after.keys()
regressions=[k for k in before if before[k]['status']=='imported' and after[k]['status']!='imported'];assert not regressions,regressions
groups=collections.defaultdict(list)
for row in new['records']:groups[row['sample']].append(row)
samples=(up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines();tasks=[]
for sample,rows in groups.items():
 if all(r['status']=='imported' for r in rows) and any(before[key(r)]['status']!='imported' for r in rows):
  content=(up/sample/'graph_list.txt').read_bytes();assert content.decode().splitlines()==[r['graph'] for r in rows]
  tasks.append({'index':samples.index(sample),'sample':sample,'graphs':len(rows),'graph_list_sha256':hashlib.sha256(content).hexdigest()})
newly=[{'sample':sample,'graph':graph,'previous_error':before[(sample,graph)].get('error')} for sample,graph in before if before[(sample,graph)]['status']!='imported' and after[(sample,graph)]['status']=='imported']
delta={'old_imports':sum(r['status']=='imported' for r in before.values()),'new_imports':sum(r['status']=='imported' for r in after.values()),'newly_imported':newly,'regressions':regressions,'newly_complete_tasks':tasks,'scope':'Import eligibility only; not execution acceptance'}
plan={'format':'kiln-task-plan/1','selection':'Every newly complete import family after singleton view binding; no shape/dtype filtering. Operation support qualification, not optimization confirmation.','nominal_tolerance':-5,'target':'a100','hardware':'DGX Spark GB10; modified integration protocol','contraction':'separate','audit_sha256':{n:hashlib.sha256((s/n).read_bytes()).hexdigest() for n in ['import-audit-after-gelu.json','import-audit-after-singleton-views.json']},'tasks':tasks}
summary={'tasks':len(groups),'graphs':len(new['records']),'graphs_imported':delta['new_imports'],'tasks_fully_imported':[{'task':sample,'graphs':len(rows)} for sample,rows in groups.items() if all(r['status']=='imported' for r in rows)],'scope':delta['scope']}
for name,value in [('singleton-view-import-delta.json',delta),('singleton-view-source-cohort-plan.json',plan),('import-audit-after-singleton-views-summary.json',summary)]:
 with (s/name).open('x') as file:file.write(json.dumps(value,indent=2)+'\n')
print(json.dumps({'new_imports':delta['new_imports'],'newly_imported':len(newly),'complete_families':len(summary['tasks_fully_imported']),'newly_complete':len(tasks),'new_cohort_graphs':sum(t['graphs'] for t in tasks),'regressions':len(regressions)},indent=2))
