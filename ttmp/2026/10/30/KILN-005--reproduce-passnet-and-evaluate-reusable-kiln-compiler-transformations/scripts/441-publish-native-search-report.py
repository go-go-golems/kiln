#!/usr/bin/env python3
"""Verify report facts, fill the ticket document, and publish an append-only note."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0,str(repo/'integrations/passnet'))
from policy_search import summarize_searches
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase',choices=['prepare','copy','verify'])
parser.add_argument('--vault-commit')
parser.add_argument('--receipt',type=Path,help='Fresh receipt path when ticket metadata changes after first publication')
args=parser.parse_args()
sources=ticket/'sources';study=sources/'native-policy-search-v2'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=read(study/'corpus/manifest.json')
train_path=sources/'native-policy-search-train-terminal-v1/output/measurement.json'
selection_path=sources/'native-policy-search-selection-v1.json'
train=read(train_path);selection=read(selection_path)
heldout=read(sources/'native-policy-search-heldout-terminal-v1/output/measurement.json')
summary=read(sources/'native-policy-search-summary-v1.json')
assert summary==summarize_searches(manifest,train,selection,heldout)
assert len(train['records'])==12 and len(heldout['records'])==8
assert all(row['selected_policy']=='baseline' and row['heldout_qualified'] and row['changed_heldout_artifacts']==0
           and row['heldout_family_balanced_e2e_speedup']==row['heldout_family_balanced_stream_elapsed_speedup']==1
           for row in summary['methods'].values())
commit='e2b85df5d24ee176a43fcd9461048013a03a83d8'
for path in [train_path,selection_path]:
    assert path.read_bytes()==subprocess.check_output(['git','show',commit+':'+str(path.relative_to(repo))],cwd=repo)
gate=read(sources/'native-policy-search-artifacts-v1/sensitivity.json')
assert len(gate['artifact_sha256'])==10 and sum(map(len,gate['artifact_sha256'].values()))==200
assert not any(gate['compile_failures'].values())
aliases=[]
for name in ['threshold','random']:
    for row in selection['selections'][name]['ranking'][1:]:
        if row['family_balanced_speedup']==1:
            assert all(gate['semantic_sha256'][row['policy']][i]==gate['semantic_sha256']['baseline'][i]
                       for i,r in enumerate(manifest['variants']) if r['split']=='train')
            aliases.append(row['policy'])
assert len(aliases)==4
for phase,count in [('train',22800),('heldout',4800)]:
    audit=read(sources/f'native-policy-search-{phase}-audit-v1.json')
    assert audit['status']=='passed' and audit['raw_timing_samples_verified']==count
model=read(sources/'native-policy-search-model-audit-v1/result.json')
assert model['status']=='passed' and model['task']['unique_artifacts']==0 and model['task']['attempts']==4
report=ticket/'reference/23-controlled-compiler-policy-search-protocol-failures-aliases-and-unchanged-winners.md'
draft=sources/'native-policy-search-report-draft-v1.md'
if args.phase=='prepare':
    frontmatter=report.read_text().split('---',2)[1]
    report.write_text('---'+frontmatter+'---\n\n'+draft.read_text())
    draft.unlink()
body=report.read_text().split('---',2)[2].lstrip()
vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc')
relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Controlled Policy Search and Unchanged Winners.md')
destination=vault/relative
note='''---
title: "Kiln: Controlled Policy Search and Unchanged Winners"
aliases:
  - Kiln Controlled Search Pilot
tags:
  - article
  - compilers
  - gpu
  - llm
  - reproducibility
status: active
type: article
created: 2026-10-31
repo: /home/manuel/code/wesen/kiln/worktrees/passnet
---

'''+body
if args.phase=='copy':
    destination.parent.mkdir(parents=True,exist_ok=True)
    with destination.open('x') as stream:stream.write(note)
elif args.phase=='verify':
    assert args.vault_commit
    assert destination.read_text()==note
    assert subprocess.check_output(['git','show',args.vault_commit+':'+str(relative)],cwd=vault)==note.encode()
    remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],cwd=vault,text=True).split()[0]
    assert remote==args.vault_commit,'Published commit is not the remote main head'
    receipt={'status':'published','vault_commit':args.vault_commit,'vault_path':str(destination),
             'report_sha256':sha(report),'vault_note_sha256':sha(destination),
             'selection_commit':commit,'training_graphs':12,'confirmation_graphs':8,
             'successful_compilations':200,'raw_timing_samples_verified':27600,
             'all_methods_selected':'baseline','scope':'Bounded negative search comparison; full project remains active'}
    with (args.receipt or sources/'native-policy-search-publication-v1.json').open('x') as stream:json.dump(receipt,stream,indent=2);stream.write('\n')
print(json.dumps({'phase':args.phase,'report':str(report),'vault_note':str(destination),'words':len(body.split()),
                  'facts':'verified','exact_baseline_alias_candidates':len(aliases)},indent=2))
