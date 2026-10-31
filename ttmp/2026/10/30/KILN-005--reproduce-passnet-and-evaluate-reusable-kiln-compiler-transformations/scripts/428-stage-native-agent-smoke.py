#!/usr/bin/env python3
"""Stage committed task sources in an isolated DGX directory, then launch tmux."""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import re
import subprocess
import tarfile

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--study',type=Path,required=True)
parser.add_argument('--name',required=True,help='Unique run ID; also names the owned container/session')
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
assert re.fullmatch('[a-z0-9-]+',args.name),'Invalid run ID'
study=args.study.resolve();out=args.output.resolve()
protocol=json.loads((study/'protocol.json').read_text())
searches=[s for s in protocol['searches'] if s['method']=='external-llm']
assert len(searches)==1,'Exactly one model batch per owner'
run_config={'name':args.name,'proposal_budget':protocol['proposal_budget'],**searches[0]}
out.mkdir()
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
files={}
for relative in ['integrations/passnet/run_native_policy_agent.py','integrations/passnet/native_policy_task.py',
                 'integrations/passnet/optimization_artifact.mjs','integrations/passnet/fusion_policy.mjs',
                 'integrations/passnet/propose_policy.py','packages/kiln/src/std/fusion.js',
                 'packages/evidence/src/canonical.ts','packages/evidence/src/sha256.ts','package.json']:
    files['repo/'+relative]=repo/relative
files['run.py']=ticket/'scripts/429-run-native-agent-smoke.py'
files['inputs/manifest.json']=study/'corpus/manifest.json'
files['inputs/receipt.json']=study/'controls/default/compile-receipt.json'
files['inputs/protocol.json']=study/'protocol.json'
for path in files.values():
    committed=subprocess.check_output(['git','show',revision+':'+str(path.relative_to(repo))],cwd=repo)
    assert committed==path.read_bytes(),'Commit input first: '+str(path)
framework={}
with tarfile.open(ticket/'sources/agent-runtime-bootstrap-v1/r2e-gym-source.tar.gz') as archive:
    for module in ['r2egym.agenthub.action.action','r2egym.agenthub.trajectory.trajectory']:
        member=next(m for m in archive.getmembers() if m.name.endswith('/src/'+module.replace('.','/')+'.py'))
        framework[module]=hashlib.sha256(archive.extractfile(member).read()).hexdigest()
manifest={'source_revision':revision,'framework_revision':'0d94c4eb9431cd195c55a7ea3abd54006c9a1735',
          'run':run_config,
          'files_sha256':{name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in files.items()},
          'framework_files_sha256':framework,
          'source_paths':{name:str(path.relative_to(repo)) for name,path in files.items()}}
(out/'bundle.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive_path=out/'bundle.tar.gz'
with tarfile.open(archive_path,'w:gz') as archive:
    for name,path in files.items():archive.add(path,arcname=name,recursive=False)
    archive.add(out/'bundle.json',arcname='bundle.json')
remote='/home/manuel/passnet-kiln/KILN-005/sources/'+args.name
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['mkdir '+shlex.quote(remote)],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(archive_path),'manuel@bling:'+remote+'/bundle.tar.gz'],check=True)
subprocess.run(ssh+['tar -xzf '+shlex.quote(remote+'/bundle.tar.gz')+' -C '+shlex.quote(remote)],check=True)
python='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1/agent-locked-venv/bin/python'
inner=shlex.join([python,remote+'/run.py'])
command='sg docker -c '+shlex.quote(inner)+' > '+shlex.quote(remote+'/driver.stdout.txt')+' 2>&1'
session='kiln-'+args.name
subprocess.run(ssh+['tmux new-session -d -s '+shlex.quote(session)+' '+shlex.quote(command)],check=True)
receipt={'status':'launched','source_revision':revision,'remote':remote,'tmux':session,
         'bundle_sha256':hashlib.sha256(archive_path.read_bytes()).hexdigest(),'command':command}
(out/'launch.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
