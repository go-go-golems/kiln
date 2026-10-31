"""Collect the completed GPU experiment and rank declared development policies."""
import json
from pathlib import Path
import subprocess
import sys
T=Path(__file__).resolve().parent.parent
out=T/'sources/pi-transformation-results-v1';out.mkdir()
remote='/home/manuel/passnet-kiln/KILN-005/sources/pi-transformation-train-v1'
for name,relative in [('run.json','run.json'),('measurement.json','output/measurement.json')]:
 subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local','manuel@bling:'+remote+'/'+relative,str(out/name)],check=True)
assert json.loads((out/'run.json').read_text())['status']=='complete'
subprocess.run([sys.executable,'integrations/passnet/select_policy.py','--training',str(out/'measurement.json'),'--output',str(out/'selection.json')],check=True)
