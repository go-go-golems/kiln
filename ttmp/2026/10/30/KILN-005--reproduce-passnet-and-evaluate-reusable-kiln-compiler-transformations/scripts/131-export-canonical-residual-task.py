#!/usr/bin/env python3
"""Replace legacy operand binding with canonical graph-role input order."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1];repo=next(p for p in root.parents if (p/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
from generate_pass import generate
upstream=root/'sources/upstream';sample=(upstream/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()[11]
directory=root/'sources/fourth-task-canonical'
if directory.exists():raise ValueError('Preserve existing canonical corpus')
export_task(upstream,sample,directory)
generate(directory,upstream,root/'sources/fourth-task-canonical-pass',Path('/work/fourth-task-canonical'))
