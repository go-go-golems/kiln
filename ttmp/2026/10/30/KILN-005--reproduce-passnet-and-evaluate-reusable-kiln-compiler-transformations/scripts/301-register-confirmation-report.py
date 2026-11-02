#!/usr/bin/env python3
"""Register primary review relations and the audited milestone in docmgr."""
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists())
report=next((p/'reference').glob('18-*.md'))
command=['docmgr','doc','relate','--doc',str(report)]
for file,note in [(repo/'integrations/passnet/compiler_confirmation.py','Frozen compiler-pair source controls and complete qualification'),(repo/'integrations/passnet/measure_compiler_confirmation.py','Shared numerical and randomized repeat measurement'),(p/'scripts/296-verify-reshape-confirmation.py','Independent raw-sample and source audit'),(p/'sources/reshape-confirmation-independent-audit-v2.json','Complete verified experimental facts'),(p/'sources/reshape-confirmation-measurements-v2.json','All declared family outcomes and raw timing samples')]:command+=['--file-note',str(file)+':'+note]
subprocess.run(command,cwd=repo,check=True)
subprocess.run(['docmgr','changelog','update','--ticket','KILN-005','--entry','Completed p4wv fixed-source confirmation: 20/20 fresh exact models qualify; 40 artifacts and 23,400 samples independently audited. Observed 1.053746x e2e / 1.059878x stream, retaining 10 slower families. Report18 explains FP32 research scope; official cumulative coverage unchanged at24 tasks/313 graphs.','--file-note',str(report)+':Full technical analysis and experimental limits'],cwd=repo,check=True)
