#!/usr/bin/env python3
"""Audit the completed policy study before publishing its milestone results."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];sources=p/'sources';directory=sources/'policy-measurements-v1'
m=json.loads((sources/'policy-corpus-v2/manifest.json').read_text())
assert hashlib.sha256(json.dumps(m['variants'],sort_keys=True).encode()).hexdigest()==m['membership_sha256']
for record in m['variants']:
 assert hashlib.sha256((sources/'policy-corpus-v2'/record['script']).read_bytes()).hexdigest()==record['source_sha256']
train=json.loads((directory/'train.json').read_text());test=json.loads((directory/'heldout.json').read_text());selection=json.loads((directory/'selection.json').read_text());summary=json.loads((directory/'summary.json').read_text());stress=json.loads((directory/'stress.json').read_text())
for data in [train,test,selection,summary,stress]:assert data['membership_sha256']==m['membership_sha256']
for data,split in [(train,'train'),(test,'heldout')]:
 assert data['status']=='complete'
 assert [r['graph'] for r in data['records']]==[r['graph'] for r in m['variants'] if r['split']==split]
 assert all(group['status']=='measured' for row in data['records'] for group in row['measurements'].values())
assert test['policies']==['baseline',selection['selected_policy']]
assert selection['selected_policy']=='relaxed125' and selection['heldout_feedback_used'] is False
assert summary['heldout_qualified'] and summary['heldout_graphs']==7 and summary['heldout_families']==4
expected={(r['graph'],policy,seed) for r in m['variants'] for policy in ['baseline',selection['selected_policy']] for seed in [1,7,42]}
observed={(r['graph'],r['policy'],r['seed']) for r in stress['records']}
assert observed==expected and len(stress['records'])==len(expected)==60
assert stress['status']=='complete' and all(r['status']=='passed' for r in stress['records'])
facts={'format':'kiln-policy-study-facts/1','status':'verified','compiler_commit':'7a20a9b','selection_commit':'575effd',
 'membership_sha256':m['membership_sha256'],'selected_max_work_growth':1.25,'training_graphs':3,'training_families':2,'heldout_graphs':7,'heldout_families':4,
 'training_family_balanced_speedup':summary['training_family_balanced_speedup'],'heldout_family_balanced_e2e_speedup':summary['heldout_family_balanced_e2e_speedup'],
 'heldout_family_balanced_stream_elapsed_speedup':summary['heldout_family_balanced_stream_elapsed_speedup'],'changed_heldout_graphs':summary['changed_heldout_artifacts'],
 'stress_comparisons':60,'stress_max_abs_error':max(max(r['output_max_abs_errors']) for r in stress['records']),
 'scope':'Exploratory FP32 development study; relative to unchanged Kiln; not the official PassBench score or full-corpus result'}
(directory/'verified-facts.json').write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps(facts,indent=2))
