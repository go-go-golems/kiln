"""Repeat the exact compiled experiment in a fresh remote directory."""
import json
from pathlib import Path
import shlex
import subprocess

ticket=Path(__file__).resolve().parent.parent
old='/home/manuel/passnet-kiln/KILN-005/sources/pi-six-lane-train-v1'
name='pi-six-lane-repeat-v1';remote='/home/manuel/passnet-kiln/KILN-005/sources/'+name
code=f'''import json,tarfile
from pathlib import Path
p=Path({remote!r});p.mkdir()
with tarfile.open({(old+'/bundle.tar.gz')!r}) as t:t.extractall(p,filter='data')
b=json.loads((p/'bundle.json').read_text());b['name']={name!r};(p/'bundle.json').write_text(json.dumps(b,indent=2)+'\\n')
'''
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['python3 -c '+shlex.quote(code)],check=True)
command='sg docker -c '+shlex.quote('python3 '+remote+'/run.py')+' > '+remote+'/driver.stdout.txt 2>&1'
subprocess.run(ssh+['tmux new-session -d -s kiln-'+name+' '+shlex.quote(command)],check=True)
out=ticket/'sources/pi-six-lane-repeat-launch-v1.json'
out.write_text(json.dumps({'remote':remote,'tmux':'kiln-'+name,'original':old,'change':'Fresh run name only; same compiled inputs and evaluator'},indent=2)+'\n')
