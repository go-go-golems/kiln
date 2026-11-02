#!/usr/bin/env python3
"""Stage the frozen source replay directories, preserving dataset-relative paths."""
import json
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'sources/policy-corpus-v3/manifest.json').read_text())
upstream=root/'sources/upstream'
for row in manifest['variants']:
 source=upstream/row['graph']
 if not (source/'input_meta.py').is_file():raise ValueError(f'Missing local source metadata: {source}')
 subprocess.run(['rsync','-aR',str(upstream)+'/./'+row['graph']+'/', 'bling.local:/home/manuel/passnet-kiln/KILN-005/upstream/'],check=True)
print('Staged',len(manifest['variants']),'source replay directories')
