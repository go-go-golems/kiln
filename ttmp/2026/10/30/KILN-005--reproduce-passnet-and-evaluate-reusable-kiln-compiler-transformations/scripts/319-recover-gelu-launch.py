#!/usr/bin/env python3
"""Recover a verified pre-GPU host-wrapper failure with the installed Node path."""
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
raw=subprocess.check_output(ssh+['cat '+base+'/gelu-validation-v1.log'],text=True)
assert '/home/manuel/.nvm/nvm.sh: No such file or directory' in raw
(p/'sources/gelu-launch-v1-failure.log').write_text(raw)
subprocess.run(ssh+['test ! -e '+base+'/gelu-cuda-validation-v1.json && test ! -d '+base+'/gelu-source-cohort-v1 && ! tmux has-session -t passnet-gelu-v1 2>/dev/null && /usr/local/bin/node --version'],check=True)
script=p/'scripts/318-run-gelu-validation-v2.sh'
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(script),'manuel@bling:'+base+'/'],check=True)
command='tmux new-session -d -s passnet-gelu-v2 '+shlex.quote('bash '+base+'/318-run-gelu-validation-v2.sh > '+base+'/gelu-validation-v2.log 2>&1')
subprocess.run(ssh+[command],check=True)
print('Started corrected pre-GPU launch; preserved failed wrapper and log')
