"""Select fresh exact-model confirmation graphs after committing the transformation."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'integrations/passnet'))
from prepare_study import prepare
from freeze_study import freeze_candidates
out=ticket/'sources/staged-fusion-fresh-v2';out.mkdir()
tracked=subprocess.check_output(['git','ls-files',str(ticket.relative_to(root)/'sources')],text=True).splitlines()
excluded={}
for name in tracked:
 if not name.endswith('/manifest.json'):continue
 data=json.loads(Path(name).read_text())
 if not isinstance(data,dict):continue
 for row in data.get('variants',[]):
  if '/samples/' in row.get('graph','') and 'source_sha256' in row:excluded[row['graph']]={'graph':row['graph'],'source_sha256':row['source_sha256']}
(out/'excluded.json').write_text(json.dumps({'variants':list(excluded.values())},indent=2)+'\n')
spec=json.loads((ticket/'sources/policy-corpus-v8-r2/selection-spec.json').read_text())
spec.update(salt='KILN-005-staged-fusion-fresh-v2',excluded_manifests=['excluded.json'],train_per_category=0,heldout_per_category=10,max_graphs_per_task=64)
(out/'selection-spec.json').write_text(json.dumps(spec,indent=2)+'\n')
(out/'declaration.json').write_text(json.dumps({'fixed_compiler_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
 'fixed_program':{'format':'kiln-transformation-program/1','id':'staged-fusion','kind':'scheduling-fusion'},
 'excluded_graphs':len(excluded),'scope':'20 fresh exact-model graphs; 10 matrix and 10 reduction; architecture relatives may remain; no outcome-based replacement'},indent=2)+'\n')
corpus=out/'corpus';prepare(ticket/'sources/upstream',corpus,out/'selection-spec.json')
policies=[json.loads((ticket/'sources/staged-fusion-study-v1/corpus/policies'/name).read_text()) for name in ['baseline.json','default.json','staged-fusion.json']]
(corpus/'policies').mkdir(exist_ok=True)
for policy in policies[:2]:(corpus/'policies'/(policy['id']+'.json')).write_text(json.dumps(policy,indent=2)+'\n')
manifest=json.loads((corpus/'manifest.json').read_text())
freeze_candidates(corpus,{'policies':policies,'training_membership_sha256':manifest['membership_sha256'],
 'provenance':'Fixed manually derived transformation selected on previous development corpus before this metadata-only selection.'},ticket/'scripts/179-run-rich-full-precision.py')
print('selected',len(manifest['variants']),'fresh graphs',flush=True)
