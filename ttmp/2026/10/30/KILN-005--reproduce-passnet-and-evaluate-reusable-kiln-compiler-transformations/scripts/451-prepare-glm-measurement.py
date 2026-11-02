"""Reuse the established measurement path for the three real GLM proposals."""
import json
from pathlib import Path
import shutil
import sys
root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'integrations/passnet'))
from freeze_study import freeze_candidates
old=ticket/'sources/native-policy-search-v2/corpus'
study=ticket/'sources/pi-policy-study-v1';corpus=study/'corpus'
corpus.mkdir(parents=True);(corpus/'policies').mkdir()
for path in old.iterdir():
 if path.name in ['manifest.json','reference-domains.json'] or path.suffix=='.js':shutil.copy(path,corpus/path.name)
controls=[]
for name in ['baseline','default']:
 path=old/'policies'/(name+'.json');shutil.copy(path,corpus/'policies'/path.name);controls.append(json.loads(path.read_text()))
policies=[]
for path in sorted((ticket/'sources/pi-policy-compile-v1').glob('attempt-*.json')):policies.append(json.loads(path.read_text()))
manifest=json.loads((corpus/'manifest.json').read_text())
proposals={'policies':controls+policies,'training_membership_sha256':manifest['membership_sha256'],
 'provenance':'Actual Pi/LunaRoute glm-5.3-flash batch; development data reused; no fresh held-out claim.'}
freeze_candidates(corpus,proposals,ticket/'scripts/179-run-rich-full-precision.py')
print(corpus)
