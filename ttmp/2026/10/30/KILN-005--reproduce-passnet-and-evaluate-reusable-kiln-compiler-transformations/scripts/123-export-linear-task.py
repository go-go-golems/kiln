#!/usr/bin/env python3
"""Export complete evaluation task 121 and generate source-derived match passes."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1];repo=next(p for p in root.parents if (p/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
from generate_pass import generate
upstream=root/'sources/upstream';sample=(upstream/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()[121]
directory=root/'sources/seventh-task'
export_task(upstream,sample,directory)
generate(directory,upstream,root/'sources/seventh-task-pass',Path('/work/seventh-task'))
print('Complete task',sample)
