"""Preserve the supplied study and index all diary entries for the project reassessment."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ticket=Path(__file__).resolve().parents[1]
root=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
original=Path('/home/manuel/Downloads/kiln_meta_compiler_study.md')
copy=ticket/'sources/kiln-meta-compiler-study.md'
assert copy.read_bytes()==original.read_bytes()
diary=ticket/'reference/01-detailed-investigation-diary.md'
text=diary.read_text()
entries=re.split(r'(?=^## Step \d+:)',text,flags=re.M)[1:]
assert len(entries)==148
out=ticket/'sources/project-reassessment-review-v1'
out.mkdir(exist_ok=True)
for start in range(0,len(entries),37):
    packet=[]
    for entry in entries[start:start+37]:
        sections=re.split(r'(?=^### )',entry,flags=re.M)
        chosen=[sections[0]]+[s for s in sections[1:] if s.startswith('### What I learned')]
        packet.append('\n'.join(chosen))
    (out/f'diary-{start+1:03d}-{min(start+37,len(entries)):03d}.md').write_text('\n'.join(packet).rstrip()+'\n')
files=[diary,*sorted((ticket/'design-doc').glob('*.md')),
       ticket/'sources/kiln-coverage.json',copy,
       root/'integrations/passnet/fusion_policy.mjs',root/'integrations/passnet/propose_policy.py',
       root/'packages/kiln/src/std/loop.js',root/'packages/kiln/src/std/fusion.js',
       root/'packages/evidence/src/identity.ts']
receipt={'format':'kiln-project-reassessment-inputs/1',
 'starting_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'diary_entries':len(entries),'diary_review':'All entry introductions and lessons indexed; critical implementation/failure sections are read separately.',
 'study_original':str(original),'study_sha256':hashlib.sha256(copy.read_bytes()).hexdigest(),
 'study_scope':'User-supplied research/design recommendations; external references are not independently revalidated wholesale.',
 'files_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
(out/'inputs.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({key:receipt[key] for key in ['starting_revision','diary_entries','study_sha256']}))
