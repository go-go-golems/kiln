"""Compare the manually derived transformation with baseline and its GLM precursor."""
import json
from pathlib import Path
import shutil
import sys
root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'integrations/passnet'))
from freeze_study import freeze_candidates
old=ticket/'sources/pi-six-lane-study-v1/corpus'
corpus=ticket/'sources/staged-fusion-study-v1/corpus'
corpus.mkdir(parents=True);(corpus/'policies').mkdir()
for p in old.iterdir():
 if p.name in ['manifest.json','reference-domains.json'] or p.suffix=='.js':shutil.copy(p,corpus/p.name)
controls=[]
for name in ['baseline','default']:
 p=old/'policies'/(name+'.json');shutil.copy(p,corpus/'policies'/p.name);controls.append(json.loads(p.read_text()))
policies=controls+[json.loads((old/'policies/glm-28.json').read_text()),
 {'format':'kiln-transformation-program/1','id':'staged-fusion','kind':'scheduling-fusion'}]
manifest=json.loads((corpus/'manifest.json').read_text())
freeze_candidates(corpus,{'policies':policies,'training_membership_sha256':manifest['membership_sha256'],
 'provenance':'Manually derived staged transformation informed by measured GLM policy; development comparison.'},ticket/'scripts/179-run-rich-full-precision.py')
