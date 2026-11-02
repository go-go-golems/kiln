#!/usr/bin/env python3
import argparse,shlex,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--run-id',default='v1',choices=['v1','v2','v3','v4','v5']);run_id=parser.parse_args().run_id
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1'
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/375-run-original-passagent-smoke.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/375-run-original-passagent-smoke.py --root '+base+' --run-id '+run_id
if run_id=='v3':inner+=' --dataset '+base+'/passagent-shipping-smoke-shell-v4.jsonl'
if run_id in ['v4','v5']:inner+=' --dataset '+base+'/passagent-shipping-smoke-shell-v5.jsonl'
command='test ! -e '+base+'/original-agent-smoke-'+run_id+'.json && ! tmux has-session -t passnet-original-agent-smoke-'+run_id+' 2>/dev/null && tmux new-session -d -s passnet-original-agent-smoke-'+run_id+' '+shlex.quote('sg docker -c '+shlex.quote(inner)+' > '+base+'/original-agent-smoke-driver-'+run_id+'.log 2>&1')
subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling',command],check=True)
