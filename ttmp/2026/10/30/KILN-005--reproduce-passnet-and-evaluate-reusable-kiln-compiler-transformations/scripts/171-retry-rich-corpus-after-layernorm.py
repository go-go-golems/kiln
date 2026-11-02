#!/usr/bin/env python3
"""Retry the same predeclared population after adding source LayerNorm support."""
import subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());s=p/'sources'
config=s/'rich-study-selection-v5-r1.json'
with config.open('xb') as out:out.write((s/'rich-study-selection-v5.json').read_bytes())
subprocess.run([sys.executable,str(repo/'integrations/passnet/prepare_study.py'),'--upstream',str(s/'upstream'),'--output',str(s/'policy-corpus-v5-r1'),'--config',str(config)],check=True)
