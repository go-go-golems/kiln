#!/usr/bin/env bash
set -eu
BASELINE=/tmp/kiln-passnet-reshape-baseline-c15c610
if ! test -e "$BASELINE/.git"; then
 git worktree add --detach "$BASELINE" c15c610
fi
EXPECTED=$(git rev-parse c15c610)
ACTUAL=$(git -C "$BASELINE" rev-parse HEAD)
test "$EXPECTED" = "$ACTUAL"
source /home/manuel/.nvm/nvm.sh
nvm use v26
python3 - "$BASELINE" "$PWD" <<'PYSETUP'
import hashlib,json,shutil,subprocess,sys
from pathlib import Path
baseline=Path(sys.argv[1]);current=Path(sys.argv[2]);source=current/'node_modules/acorn';destination=baseline/'node_modules/acorn'
if not destination.exists():shutil.copytree(source,destination)
def hashes(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
assert hashes(source)==hashes(destination),'Dependency bytes differ'
links=baseline/'node_modules/@kiln';links.mkdir(parents=True,exist_ok=True)
for name in ['kiln','evidence']:
 link=links/name
 if not link.exists():link.symlink_to('../../packages/'+name,target_is_directory=True)
 assert link.resolve()==baseline/'packages'/name,'Cross-worktree package link'
receipt={'scope':'Compiler-only control bootstrap using the active compiler dependency bytes; repository pnpm pin is unavailable','node':subprocess.check_output(['node','--version'],text=True).strip(),'acorn_version':json.loads((source/'package.json').read_text())['version'],'acorn_files_sha256':hashes(source),'workspace_links':['@kiln/kiln -> control packages/kiln','@kiln/evidence -> control packages/evidence']}
output=current/'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/reshape-confirmation-node-dependencies-v1.json'
output.write_text(json.dumps(receipt,indent=2)+'\n');print('Control dependency bytes and worktree-local links verified')
PYSETUP
