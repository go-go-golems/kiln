#!/usr/bin/env python3
"""Recompute the fresh study's structural, selection and confirmation accounting."""
import hashlib
import json
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1];repo=root.parents[4]
sys.path.insert(0,str(repo/'integrations/passnet'))
from qualify_policies import qualify
from select_policy import rank_training
from summarize_policy import summarize
sources=root/'sources';corpus=sources/'policy-corpus-v4';artifacts=sources/'policy-artifacts-v4';results=sources/'policy-measurements-v3'
read=lambda p:json.loads(p.read_text())
gate=qualify(corpus,artifacts)
assert gate==read(artifacts/'sensitivity.json')
manifest=read(corpus/'manifest.json');plan=read(corpus/'measurement-plan.json')
training=read(results/'train.json');heldout=read(results/'heldout.json');selection=read(results/'selection.json')
assert selection['ranking']==rank_training(training)
assert selection['selected_policy']==selection['ranking'][0]['policy']=='baseline'
assert selection['heldout_feedback_used'] is False
for phase in [training,heldout]:
 assert phase['plan']==plan
 for row in phase['records']:
  for measurement in row['measurements'].values():
   assert measurement['status']=='measured'
   assert len(measurement['rounds'])==plan['repeats']
   for repeat in measurement['rounds']:
    assert repeat['stable']
    final=repeat['attempts'][-1]
    for key in ['e2e_ms','stream_elapsed_ms']:
     assert len(final['raw_'+key])==plan['trials']
     assert final[key]['iqr']<=plan['max_iqr_fraction']*final[key]['median']
summary=summarize(manifest,training,selection,heldout)
assert summary==read(results/'summary.json')
assert summary['heldout_qualified'] and summary['changed_heldout_artifacts']==0
assert len(training['records'])==12 and len(heldout['records'])==8
facts={'membership_sha256':manifest['membership_sha256'],'training_graphs':12,'heldout_graphs':8,'selected_policy':'baseline','interpretation':'No compiler improvement; exact executable ties select unchanged compiler','heldout_speedup':summary['heldout_family_balanced_e2e_speedup'],'selection_sha256':hashlib.sha256((results/'selection.json').read_bytes()).hexdigest(),'frozen_experiment_commit':'3490375','training_selection_commit':'6d2f422'}
(results/'verified-facts.json').write_text(json.dumps(facts,indent=2)+'\n')
print(json.dumps(facts))
