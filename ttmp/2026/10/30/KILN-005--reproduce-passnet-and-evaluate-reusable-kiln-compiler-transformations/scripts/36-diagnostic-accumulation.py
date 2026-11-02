#!/usr/bin/env python3
"""Diagnostic source experiment only; not compiler output or accepted benchmark."""
from pathlib import Path
import json,re
root=Path('/home/manuel/passnet-kiln/KILN-005/third-task')
artifact=json.loads((root/'bias-fixed.json').read_text())
for kernel in artifact['kernels']:
 # Change local/shared arithmetic declarations; pointer element types remain unchanged.
 kernel['cuda']=re.sub(r'\bfloat (?=[A-Za-z_])','double ',kernel['cuda'])
artifact['diagnostic']='Higher precision local/shared accumulation experiment; identities do not represent this modified source; excluded from benchmark evidence'
(root/'diagnostic-double.json').write_text(json.dumps(artifact,indent=2)+'\n')
