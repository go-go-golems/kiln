#!/usr/bin/env python3
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/353-verify-original-agent-image.py'),'manuel@bling:'+base+'/scripts/'],check=True)
subprocess.run(ssh+['sg docker -c '+repr('python3 '+base+'/scripts/353-verify-original-agent-image.py --root '+base)],check=True)
