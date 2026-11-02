"""Retain the pinned framework reference and final report/input identities."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

t=Path(__file__).resolve().parents[1]
root=next(p for p in t.parents if (p/'integrations/passnet').is_dir())
archive=t/'sources/agent-runtime-bootstrap-v1/r2e-gym-source.tar.gz'
review=t/'sources/project-reassessment-review-v1'
with tarfile.open(archive,'r:gz') as tar:
 members=[m for m in tar.getmembers() if m.isfile() and m.name.endswith('/README.md')]
 member=min(members,key=lambda m:m.name.count('/'))
 raw=tar.extractfile(member).read()
reference=review/'r2egym-pinned-readme.md';reference.write_bytes(raw)
files=[*sorted((t/'design-doc').glob('*.md')),
 t/'reference/01-detailed-investigation-diary.md',t/'reference/03-project-roadmap.md',
 t/'reference/22-project-reassessment-from-passnet-integration-to-reusable-compiler-optimization.md',
 t/'sources/project-reassessment-report-body.md',t/'sources/project-reassessment-facts-v1.json',
 t/'sources/kiln-meta-compiler-study.md',reference,
 root/'integrations/passnet/fusion_policy.mjs',root/'integrations/passnet/propose_policy.py',
 root/'integrations/passnet/runtime.py',root/'integrations/passnet/summarize_task_run.py',
 root/'packages/kiln/src/std/loop.js',root/'packages/kiln/src/std/tensor.js',
 root/'packages/evidence/src/identity.ts']
receipt={'format':'kiln-final-project-report-inputs/1',
 'starting_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'scope':'Final working-tree report inputs before the source/evidence commit; prior review-v1/inputs.json is the earlier draft indexing snapshot.',
 'framework_reference':{'repository':'https://github.com/R2E-Gym/R2E-Gym','revision':'0d94c4eb9431cd195c55a7ea3abd54006c9a1735',
 'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'member':member.name,'readme_sha256':hashlib.sha256(raw).hexdigest()},
 'files_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
(t/'sources/project-reassessment-inputs-final-v1.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(f'Preserved pinned R2E-Gym README and {len(files)} final report input identities.')
