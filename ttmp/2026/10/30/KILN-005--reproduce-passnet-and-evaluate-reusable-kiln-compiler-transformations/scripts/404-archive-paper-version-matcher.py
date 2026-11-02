#!/usr/bin/env python3
"""Preserve paper-version matcher source for a separate compatibility investigation."""
import hashlib,inspect,json,urllib.request
from pathlib import Path
import torch.fx.passes.utils.matcher_utils as installed
p=Path(__file__).resolve().parents[1];out=p/'sources/original-agent-smoke-terminal-v1/paper-version-matcher-source';out.mkdir();records=[]
url='https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/torch/fx/passes/utils/matcher_utils.py'
with urllib.request.urlopen(url,timeout=60) as response:raw=response.read()
(out/'pytorch-2.9.1-matcher_utils.py').write_bytes(raw);records.append({'url':url,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
current=Path(inspect.getfile(installed));content=current.read_bytes();(out/'installed-matcher_utils.py').write_bytes(content)
(out/'provenance.json').write_text(json.dumps({'format':'kiln-original-matcher-source-provenance/1','sources':records,'installed_path':str(current),'installed_sha256':hashlib.sha256(content).hexdigest(),'scope':'Static primary-source inspection, not a paper-version runtime measurement; no copied implementation integrated into Kiln'},indent=2)+'\n');print('Archived',len(raw),'paper-version matcher source bytes')
