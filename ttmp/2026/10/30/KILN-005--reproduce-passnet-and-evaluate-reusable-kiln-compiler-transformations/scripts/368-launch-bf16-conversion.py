#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1'
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/367-convert-original-bf16-checkpoint.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/367-convert-original-bf16-checkpoint.py --root '+base
command='test ! -e '+base+'/model-conversion-v1.json && ! tmux has-session -t passnet-model-conversion-v1 2>/dev/null && tmux new-session -d -s passnet-model-conversion-v1 '+shlex.quote(inner+' > '+base+'/model-conversion-driver-v1.log 2>&1')
subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling',command],check=True)
print('Started original checkpoint BF16 conversion; no inference or benchmark yet')
