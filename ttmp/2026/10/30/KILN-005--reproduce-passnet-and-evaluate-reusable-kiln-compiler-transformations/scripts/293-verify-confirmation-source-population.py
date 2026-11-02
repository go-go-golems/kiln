#!/usr/bin/env python3
"""Audit exact-model freshness and complete quotas before compiler feedback."""
import hashlib,json,sys
from collections import Counter
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from prepare_study import model_of
corpus=s/'reshape-confirmation-v2';manifest=json.loads((corpus/'manifest.json').read_text());spec=json.loads((corpus/'selection-spec.json').read_text());plan=json.loads((s/'reshape-confirmation-declaration-v2.json').read_text());up=s/'upstream'
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(corpus/'selection-spec.json')==plan['selection_spec_sha256']
rows=manifest['variants'];assert len(rows)==20 and Counter(r['category'] for r in rows)=={'matrix':10,'reduction':10}
assert {r['split'] for r in rows}=={'heldout'} and len({r['model'] for r in rows})==20 and len({r['sample'] for r in rows})==20
excluded=set()
for sample in (up/spec['evaluation_list']).read_text().splitlines():
 for graph in (up/sample/'graph_list.txt').read_text().splitlines():excluded.add(model_of(graph))
for name in spec['excluded_manifests']:
 for row in json.loads((s/name).read_text())['variants']:excluded.add(model_of(row['graph']))
assert not excluded.intersection(r['model'] for r in rows)
assert hashlib.sha256(json.dumps(sorted(excluded)).encode()).hexdigest()==manifest['excluded_models_sha256']
for row in rows:
 assert model_of(row['graph'])==row['model'] and sha(corpus/row['script'])==row['source_sha256']
 for name,digest in row['source_files_sha256'].items():assert sha(up/row['graph']/name)==digest
selected=[r for r in json.loads((corpus/'scan-audit.json').read_text())['records'] if r['status']=='selected']
assert [r['graph'] for r in selected]==[r['graph'] for r in rows]
result={'scope':'Pre-compilation source membership/freshness audit; architecture relatives may remain','graphs':20,'exact_models':20,'categories':dict(Counter(r['category'] for r in rows)),'overlap_with_evaluation_or_prior_policy_models':0,'excluded_model_count':len(excluded),'membership_sha256':manifest['membership_sha256'],'all_generated_and_original_source_hashes_match':True,'metadata_only_retry':'The failed v1 selection is preserved; its metadata-only choices may recur, without being counted as independent confirmations'}
(s/'reshape-confirmation-source-population-verification-v2.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
