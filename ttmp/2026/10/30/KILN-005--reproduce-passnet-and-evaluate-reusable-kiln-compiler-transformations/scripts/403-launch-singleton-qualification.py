#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
base='/home/manuel/passnet-kiln/KILN-005';session='passnet-singleton-qualification-v1';inner='bash '+base+'/402-run-singleton-qualification.sh'
command='test ! -e '+base+'/singleton-view-fixtures-v1/compile-receipt.json && ! tmux has-session -t '+session+' 2>/dev/null && tmux new-session -d -s '+session+' '+shlex.quote('sg docker -c '+shlex.quote(inner)+' > '+base+'/singleton-view-qualification-v1.log 2>&1')
subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling',command],check=True)
print('Started one fixture-gated complete55-variant qualification; no model serving')
