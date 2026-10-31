#!/usr/bin/env python3
"""Verify original source bytes, symlink resolution and empty agent workspaces in the image."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();build=json.loads((root/'agent-image-v3.json').read_text());assert build['status']=='complete'
receipt=root/'agent-image-fidelity-v1.json'
if receipt.exists():raise ValueError('Preserve image fidelity evidence')
code=r'''
import hashlib,json
from pathlib import Path
import torch,triton,scipy,numpy,chardet
root=Path('/workspace/passnet');manifest=json.loads(Path('/bootstrap/agent-context-manifest.json').read_text());membership=json.loads(Path('/bootstrap/evaluation-membership.json').read_text());files=links=0
for row in manifest['members']:
 path=root/row['path']
 if row['type']=='file':assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'],row['path'];files+=1
 elif row['type']=='symlink':assert path.is_symlink() and path.readlink().as_posix()==row['target'] and path.exists(),row['path'];links+=1
 else:assert path.is_dir(),row['path']
for relative in manifest['empty_pass_directories']:assert (root/relative).is_dir() and not list((root/relative).iterdir()),relative
for row in membership['members']:
 sample=root/row['sample'];assert hashlib.sha256((sample/'graph_list.txt').read_bytes()).hexdigest()==row['graph_list_sha256']
 entry=(sample/'entry.sh').resolve();assert (entry.parent.parent/'pass_bench/__init__.py').is_file()
 for graph in row['graphs']:
  for filename in ['model.py','input_meta.py','weight_meta.py']:assert (sample/graph/filename).is_file(),str(sample/graph/filename)
from pass_bench.torch.test_compiler import get_input_dict
print(json.dumps({'source_files_verified':files,'symlinks_verified':links,'empty_pass_directories':len(manifest['empty_pass_directories']),'canonical_tasks':len(membership['members']),'canonical_graphs':sum(len(row['graphs']) for row in membership['members']),'versions':{'torch':torch.__version__,'triton':triton.__version__,'scipy':scipy.__version__,'numpy':numpy.__version__,'chardet':chardet.__version__},'original_evaluator_import':True}))
'''
command=['docker','run','--rm','-v',str(root)+':/bootstrap:ro','--entrypoint','python',build['image_id'],'-c',code]
r=subprocess.run(command,capture_output=True,text=True);state={'format':'kiln-original-agent-image-fidelity/1','returncode':r.returncode,'image_id':build['image_id'],'source_context_sha256':build['source_context_sha256'],'stdout':r.stdout,'stderr':r.stderr,'command':command}
if r.returncode==0:state['verified']=json.loads(r.stdout.splitlines()[-1])
with receipt.open('x') as file:file.write(json.dumps(state,indent=2)+'\n')
print(json.dumps(state.get('verified',state),indent=2));raise SystemExit(r.returncode)
