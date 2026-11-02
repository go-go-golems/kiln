#!/usr/bin/env python3
"""Install the pinned original framework in an isolated host virtual environment."""
import argparse,hashlib,json,subprocess,sys,tarfile,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);args=parser.parse_args();root=args.root.resolve();receipt=root/'agent-environment-v1.json'
if receipt.exists():raise ValueError('Preserve previous environment job')
record=next(row for row in json.loads((root/'source-archives.json').read_text()) if row['name']=='r2e-gym');archive=root/record['file'];assert hashlib.sha256(archive.read_bytes()).hexdigest()==record['sha256']
source=root/'r2e-src';source.mkdir()
with tarfile.open(archive) as tar:
 prefix=tar.getnames()[0].split('/')[0]
 for member in tar.getmembers():
  relative=Path(member.name).relative_to(prefix)
  if str(relative)=='.':continue
  member.name=str(relative);tar.extract(member,path=source,filter='data')
venv=root/'agent-venv';python=venv/'bin/python';state={'format':'kiln-original-agent-environment/1','status':'running','driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'framework_revision':record['revision'],'python_host':sys.version,'phases':[]}
def save():
 temporary=receipt.with_suffix('.tmp');temporary.write_text(json.dumps(state,indent=2)+'\n');temporary.replace(receipt)
commands=[('venv',[sys.executable,'-m','venv',str(venv)]),('install',[str(python),'-m','pip','--disable-pip-version-check','install','--cache-dir',str(root/'pip-cache'),str(source),'docker','chardet'])]
try:
 for name,command in commands:
  state['phase']=name;save();started=time.monotonic()
  with (root/('agent-'+name+'-v1.log')).open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
  state['phases'].append({'name':name,'command':command,'returncode':r.returncode,'elapsed_seconds':time.monotonic()-started});save()
  if r.returncode:raise RuntimeError(name+' returned '+str(r.returncode))
 with (root/'agent-pip-freeze-v1.txt').open('w') as file:subprocess.run([str(python),'-m','pip','freeze','--all'],stdout=file,check=True)
 with (root/'agent-pip-inspect-v1.json').open('w') as file:subprocess.run([str(python),'-m','pip','inspect'],stdout=file,check=True)
 code='import sys;sys.path.insert(0,'+repr(str(root/'passnet-pristine/pass_agent'))+');from runtime.passnet_docker import PassNetDocker;from agent.pass_agent import PassAgent;print("Original PassAgent and PassNetDocker imports succeeded")'
 with (root/'agent-import-v1.log').open('w') as file:r=subprocess.run([str(python),'-c',code],stdout=file,stderr=subprocess.STDOUT)
 state['phases'].append({'name':'original_import','returncode':r.returncode});save()
 if r.returncode:raise RuntimeError('original_import returned '+str(r.returncode))
 state.update(status='complete',freeze_sha256=hashlib.sha256((root/'agent-pip-freeze-v1.txt').read_bytes()).hexdigest())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
