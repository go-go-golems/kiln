#!/usr/bin/env python3
"""Freeze structural/resource eligibility before observing a richer study's timings."""
import json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());s=p/'sources'
config=s/'rich-study-selection-v5.json'
if config.exists():raise ValueError('Preserve the existing declaration')
spec={'format':'kiln-rich-study-selection/1','salt':'KILN-005-rich-scheduling-v5','sample_list':'sample_lists/train/hf_fusible_train_samples_v2.txt','evaluation_list':'sample_lists/eval/hf_fusible_eval_samples_v2.txt',
 'excluded_manifests':[str(path.relative_to(s)) for path in sorted(s.glob('policy-corpus-v*/manifest.json'))],
 'train_per_category':6,'heldout_per_category':4,'max_tasks':4096,'max_graphs_per_task':8,
 'max_input_elements':2000000,'max_tensor_elements':8000000,'max_total_tensor_elements':64000000,'max_tensor_nodes':128,'max_matrix_products':16000000,'contraction':'separate'}
config.write_text(json.dumps(spec,indent=2)+'\n')
subprocess.run([sys.executable,str(repo/'integrations/passnet/prepare_study.py'),'--upstream',str(s/'upstream'),'--output',str(s/'policy-corpus-v5'),'--config',str(config)],check=True)
