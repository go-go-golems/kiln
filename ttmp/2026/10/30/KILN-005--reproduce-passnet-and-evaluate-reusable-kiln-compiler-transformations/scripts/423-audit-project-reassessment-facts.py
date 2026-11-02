"""Recompute report facts from current records without rerunning or relabeling experiments."""
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path

t=Path(__file__).resolve().parents[1];s=t/'sources'
def load(name):return json.loads((s/name).read_text())
ledger=load('kiln-coverage.json');records=ledger['records']
assert len(records)==200 and sum(r['graphs'] for r in records)==2060
accepted=[]
for row in records:
 passed=sum(bool(g['success'] and g['numerical_correct_at_tminus5'] and g['matches']==1) for g in row['graph_results'].values())
 assert passed==row['verified_graphs']
 if row['status']=='verified_modified_protocol':
  assert len(row['graph_results'])==passed==row['graphs'];accepted.append(row)
assert len(accepted)==ledger['tasks_verified']==31
assert sum(r['verified_graphs'] for r in records)==ledger['graphs_verified']==358
assert sum(r['graphs'] for r in accepted)==ledger['graphs_in_complete_tasks']==289
imports=load('import-audit-after-singleton-views.json')['records'];families=defaultdict(list)
assert len(imports)==2060 and len({r['graph'] for r in imports})==2060
for row in imports:families[row['sample']].append(row)
assert len(families)==200
imported=sum(r['status']=='imported' for r in imports)
complete_imports=sum(all(r['status']=='imported' for r in rows) for rows in families.values())
assert (imported,complete_imports)==(1251,76)
confirmation=load('reshape-confirmation-measurements-v2-summary.json');cr=confirmation['records']
assert len(cr)==20 and len({r['model'] for r in cr})==20
ratio=math.exp(sum(math.log(r['e2e_speedup']) for r in cr)/20)
assert abs(ratio-confirmation['family_balanced_e2e_speedup'])<1e-12
full=load('singleton-full-precision-v2/inputs.json');native=load('singleton-full-precision-v2/native.json')
assert native==load('singleton-full-precision-v2/native.stdout.log')
assert native['inputs_manifest_sha256']==hashlib.sha256((s/'singleton-full-precision-v2/inputs.json').read_bytes()).hexdigest()
for spec in full['input_files'].values():
 raw=(s/'singleton-full-precision-v2'/spec['file']).read_bytes()
 assert len(raw)==spec['bytes'] and hashlib.sha256(raw).hexdigest()==spec['sha256']
for row in native['records']:
 assert len(row['output'])==6144
 for field,ref in [('against_frontend',full['frontend_output']),('against_loop',full['loop_output'])]:
  differences=[abs(a-b) for a,b in zip(row['output'],ref)]
  assert all(math.isfinite(v) for v in differences)
  assert sum(v!=0 for v in differences)==row[field]['different']
  assert sum(v>1e-4+1e-3*abs(b) for v,b in zip(differences,ref))==row[field]['failed']
assert native['records'][0]['output']==native['records'][1]['output']
facts={'format':'kiln-project-reassessment-facts/1','coverage':{k:ledger[k] for k in ['tasks_total','graphs_total','tasks_verified','graphs_verified','graphs_in_complete_tasks','coverage_scope']},
 'imports':{'graphs':imported,'complete_families':complete_imports},
 'confirmation':{'graphs':20,'e2e_ratio_recomputed':ratio,'faster':sum(r['e2e_speedup']>1 for r in cr),'slower':sum(r['e2e_speedup']<1 for r in cr),'aliases':sum(not r['exact_executable_changed'] for r in cr),'worst_e2e_ratio':min(r['e2e_speedup'] for r in cr)},
 'full_shape_precision':{'shapes':native['input_shapes'],'records':[{k:r[k] for k in ['mode','against_frontend','against_loop']} for r in native['records']]},
 'scalar_algorithm_diagnostics':full['algorithms'],
 'limitations':['Raw graph-result fields are checked; historical experiment verifiers are not all rerun in this reporting pass.','Full-shape native probes do not execute a Kiln GPU artifact.','Current release uniform acceptance and external LLM-native policy comparison remain unproven.']}
(s/'project-reassessment-facts-v1.json').write_text(json.dumps(facts,indent=2)+'\n')
print(json.dumps(facts,indent=2))
