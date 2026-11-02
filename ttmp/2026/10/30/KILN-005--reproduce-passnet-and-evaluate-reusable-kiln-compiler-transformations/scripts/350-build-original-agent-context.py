#!/usr/bin/env python3
"""Archive original evaluator/data layout, preserving symlinks and empty pass workspaces."""
import hashlib,json,tarfile,urllib.request
from pathlib import Path
p=Path(__file__).resolve().parents[1];root=p/'sources/agent-runtime-bootstrap-v1';up=p/'sources/upstream';membership=json.loads((root/'evaluation-membership.json').read_text());shipping=json.loads((up/'pass_agent/datasets/passbench_demo_dataset_200.jsonl').read_text().splitlines()[0])
paths=set();directories=set();members=[]
def include(relative,empty_passes=False):
 start=up/relative
 for path in [start,*start.rglob('*')] if start.is_dir() and not start.is_symlink() else [start]:
  name=path.relative_to(up)
  if any(part=='__pycache__' for part in name.parts) or path.suffix=='.pyc':continue
  if empty_passes and 'pass_dir' in name.parts:continue
  paths.add(str(name))
for directory in ['pass_bench','entry_scripts','pass_agent']:include(directory)
for row in membership['members']:
 include(row['sample'],True);directories.add(row['sample']+'/pass_dir')
 for graph in row['graphs']:include(graph)
include(shipping['sample_dir'],True);directories.add(shipping['sample_dir']+'/pass_dir')
for graph in (up/shipping['sample_dir']/'graph_list.txt').read_text().splitlines():include(graph)
archive=root/'passnet-agent-context-v1.tar.gz'
with tarfile.open(archive,'w:gz',dereference=False) as tar:
 for relative in sorted(paths):
  path=up/relative;tar.add(path,arcname=relative,recursive=False)
  row={'path':relative,'type':'symlink' if path.is_symlink() else 'directory' if path.is_dir() else 'file'}
  if path.is_symlink():row['target']=path.readlink().as_posix();assert path.resolve().is_relative_to(up.resolve()) and path.exists()
  elif path.is_file():row['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
  members.append(row)
 for relative in sorted(directories):
  item=tarfile.TarInfo(relative);item.type=tarfile.DIRTYPE;item.mode=0o755;tar.addfile(item)
receipt={'format':'kiln-original-agent-context/1','upstream_revision':'61c64709f6d324216ae8252cec3cdc35b2dd5da5','archive':archive.name,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'canonical_tasks':200,'canonical_graphs':2060,'extra_shipping_smoke':shipping['sample_dir'],'empty_pass_directories':sorted(directories),'members':members,'scope':'Original evaluator, entry scripts, source metadata and symlink layout; no checker or entry script edits; generated pass directories begin empty'}
with (root/'agent-context-manifest.json').open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
shipping['docker_image']='kiln005-passagent:torch26.05'
with (root/'passagent-shipping-smoke.jsonl').open('x') as file:file.write(json.dumps(shipping)+'\n')
url='https://pypi.org/pypi/chardet/5.2.0/json'
with urllib.request.urlopen(url,timeout=45) as response:metadata=response.read()
(root/'chardet-pypi-metadata.json').write_bytes(metadata);wheel=next(row for row in json.loads(metadata)['urls'] if row['filename']=='chardet-5.2.0-py3-none-any.whl')
with urllib.request.urlopen(wheel['url'],timeout=45) as response:raw=response.read()
assert hashlib.sha256(raw).hexdigest()==wheel['digests']['sha256'];folder=root/'wheels';folder.mkdir();(folder/wheel['filename']).write_bytes(raw)
print('Context files:',len(members),'archive bytes:',archive.stat().st_size,'empty task workspaces:',len(directories))
