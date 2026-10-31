#!/usr/bin/env python3
"""Inspect existing model/cache names without reading credentials or environment."""
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1]
command=['ssh','bling.local','hostname; docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}"; ls -d /home/manuel/.cache/huggingface/hub/models--* /home/manuel/models /opt/models /home/manuel/.ollama/models/manifests 2>/dev/null']
r=subprocess.run(command,text=True,capture_output=True)
receipt={'scope':'Read-only local PassAgent runtime discovery; directory names and container image names only. Not exhaustive model/service discovery.','earlier_attempt':{'returncode':255,'stderr':'ssh: Could not resolve hostname bling.local: Name or service not known'},'command':command,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
(p/'sources/passagent-local-runtime-discovery-v2.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
