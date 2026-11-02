import json
from pathlib import Path
import shutil
import sys
root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'integrations/passnet'))
from freeze_study import freeze_candidates
old=ticket/'sources/native-policy-search-v2/corpus'
study=ticket/'sources/pi-transformation-study-v1';corpus=study/'corpus'
corpus.mkdir(parents=True);(corpus/'policies').mkdir()
for path in old.iterdir():
 if path.name in ['manifest.json','reference-domains.json'] or path.suffix=='.js':shutil.copy(path,corpus/path.name)
summary=json.loads((ticket/'sources/pi-transformation-lanes-v1/summary.json').read_text())
assert len(summary)==6 and all(r['returncode']==0 for r in summary)
controls=[]
for name in ['baseline','default']:
 path=old/'policies'/(name+'.json');shutil.copy(path,corpus/'policies'/path.name);controls.append(json.loads(path.read_text()))
controls.append({'format':'kiln-transformation-program/1','id':'staged-fusion','kind':'scheduling-fusion'})
seen={};origins={}
for path in sorted((ticket/'sources/pi-transformation-lanes-v1').glob('*/run/task/*.artifact.json')):
 artifact=json.loads(path.read_text());key=json.dumps(artifact,sort_keys=True)
 if key not in seen:
  policy=artifact['program'];policy['id']='sequence-'+str(len(seen)+1);seen[key]=policy
 origins.setdefault(seen[key]['id'],[]).append(str(path.relative_to(ticket)))
manifest=json.loads((corpus/'manifest.json').read_text())
proposals={'policies':controls+list(seen.values()),'training_membership_sha256':manifest['membership_sha256'],
 'provenance':'Six actual transformation lanes, two replicates per thinking level; development feedback only, no fresh generalization claim.'}
freeze_candidates(corpus,proposals,ticket/'scripts/179-run-rich-full-precision.py')
(study/'origins.json').write_text(json.dumps(origins,indent=2)+'\n')
print('unique policies',len(seen),'accepted artifacts',sum(map(len,origins.values())))
