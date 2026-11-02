#!/usr/bin/env python3
"""Stage one immutable policy measurement phase and launch its isolated owner."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tarfile

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
from qualify_policies import qualify
from policy_search import select_searches

parser=argparse.ArgumentParser(description=__doc__)
for name in ['study','artifacts','output']:parser.add_argument('--'+name,type=Path,required=True)
parser.add_argument('--name',required=True)
parser.add_argument('--phase',choices=['train','heldout'],required=True)
parser.add_argument('--training',type=Path)
parser.add_argument('--selection',type=Path)
args=parser.parse_args()
assert re.fullmatch('[a-z0-9-]+',args.name)
study=args.study.resolve();corpus=study/'corpus';artifacts=args.artifacts.resolve()
read=lambda path:json.loads(path.read_text())
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
freeze=read(corpus/'candidate-freeze.json');manifest=read(corpus/'manifest.json')
gate=qualify(corpus,artifacts)
assert gate==read(artifacts/'sensitivity.json')
for name,want in freeze['files_sha256'].items():assert sha(corpus/name)==want,name
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
source=snapshot(repo)
assert source==read(artifacts/'study-compile-receipt.json')['source_snapshot']
files={'repo/'+name:repo/name for name in source['files']}
wrapper=ticket/'scripts/179-run-rich-full-precision.py'
assert sha(wrapper)==freeze['execution_wrapper_sha256']
files.update({'run.py':ticket/'scripts/439-run-policy-search-evaluation.py','reference.py':wrapper})
for path in files.values():
    assert path.read_bytes()==subprocess.check_output(['git','show',revision+':'+str(path.relative_to(repo))],cwd=repo),'Commit source first: '+str(path)
for prefix,directory in [('corpus',corpus),('artifacts',artifacts)]:
    for path in sorted(directory.rglob('*')):
        if path.is_file():
            assert not path.is_symlink()
            files[prefix+'/'+str(path.relative_to(directory))]=path
upstream=ticket/'sources/upstream'
for row in manifest['variants']:
    for name,want in row['source_files_sha256'].items():
        path=upstream/row['graph']/name
        assert sha(path)==want
        files['upstream/'+row['graph']+'/'+name]=path
for path in sorted((upstream/'pass_bench').rglob('*.py')):
    if '__pycache__' not in path.parts:files['upstream/'+str(path.relative_to(upstream))]=path
if args.phase=='heldout':
    assert args.training and args.selection,'Committed training selection required'
    assert read(args.selection)==select_searches(read(args.training))
    for name,path in [('training.json',args.training.resolve()),('selection.json',args.selection.resolve())]:
        assert path.read_bytes()==subprocess.check_output(['git','show',revision+':'+str(path.relative_to(repo))],cwd=repo),'Commit selection/evidence before confirmation'
        files[name]=path
else:assert not args.training and not args.selection
out=args.output.resolve();out.mkdir()
bundle={'format':'kiln-policy-search-evaluation-bundle/1','source_revision':revision,
        'source_snapshot':source,'phase':args.phase,'name':args.name,
        'membership_sha256':manifest['membership_sha256'],
        'files_sha256':{name:sha(path) for name,path in files.items()}}
(out/'bundle.json').write_text(json.dumps(bundle,indent=2)+'\n')
archive_path=out/'bundle.tar.gz'
with tarfile.open(archive_path,'w:gz') as archive:
    for name,path in files.items():archive.add(path,arcname=name,recursive=False)
    archive.add(out/'bundle.json',arcname='bundle.json')
remote='/home/manuel/passnet-kiln/KILN-005/sources/'+args.name
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['mkdir '+shlex.quote(remote)],check=True)
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(archive_path),'manuel@bling:'+remote+'/bundle.tar.gz'],check=True)
subprocess.run(ssh+['tar -xzf '+shlex.quote(remote+'/bundle.tar.gz')+' -C '+shlex.quote(remote)],check=True)
session='kiln-'+args.name
inner=shlex.join(['python3',remote+'/run.py'])
command='sg docker -c '+shlex.quote(inner)+' > '+shlex.quote(remote+'/driver.stdout.txt')+' 2>&1'
subprocess.run(ssh+['tmux new-session -d -s '+shlex.quote(session)+' '+shlex.quote(command)],check=True)
receipt={'status':'launched','source_revision':revision,'remote':remote,'tmux':session,
         'bundle_sha256':sha(archive_path),'command':command}
(out/'launch.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
