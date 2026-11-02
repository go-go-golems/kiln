"""Freeze every eligible model from the exhausted metadata scan; no outcome filtering."""
import hashlib,json,shutil,sys
from pathlib import Path
root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'integrations/passnet'))
from corpus import translate_graph
from reference_domains import reference_domains
from freeze_study import freeze_candidates
prior=ticket/'sources/staged-fusion-fresh-v2'
out=ticket/'sources/staged-fusion-available-v1';corpus=out/'corpus';corpus.mkdir(parents=True);(corpus/'policies').mkdir()
audit=json.loads((prior/'corpus/scan-audit.json').read_text())
selected=[r for r in audit['records'] if r['status']=='selected']
(out/'declaration.json').write_text(json.dumps({'scope':'All eligible models from exhausted fixed metadata scan; revised sample size before compiler/timing outcomes',
 'prior_declared_target':20,'available':len(selected),'categories':audit['category_counts'],
 'fixed_transformation_revision':'1eb33311af1ef3ca9b4dd6b5cb850964923db395',
 'selection_audit_sha256':hashlib.sha256((prior/'corpus/scan-audit.json').read_bytes()).hexdigest()},indent=2)+'\n')
rows=[]
for i,row in enumerate(selected):
 source=ticket/'sources/upstream'/row['graph'];result=translate_graph(ticket/'sources/upstream',row['graph'],'fake')
 script=f'{i:03d}.kiln.js';text=result['script'];assert text==(prior/'corpus'/script).read_text()
 (corpus/script).write_text(text)
 rows.append({**{k:row[k] for k in ['graph','sample','model','category']},'split':'heldout','script':script,
 'source_sha256':hashlib.sha256(text.encode()).hexdigest(),'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],
 'output_structure':result['output_structure'],'reference_constraints':result['reference_constraints'],
 'reference_domain_diagnostic':result.get('reference_domain_diagnostic'),
 'source_files_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(source.iterdir()) if p.is_file()}})
identity=hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()
manifest={'format':'kiln-passnet-corpus/1','membership_sha256':identity,'numerical_policy':{'contraction':'separate'},
 'scope':'Fixed staged-fusion confirmation on all ten available fresh exact models; architecture relatives may remain','variants':rows}
(corpus/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(corpus/'reference-domains.json').write_text(json.dumps(reference_domains(corpus,ticket/'sources/upstream'),indent=2)+'\n')
policies=[json.loads((ticket/'sources/staged-fusion-study-v1/corpus/policies'/name).read_text()) for name in ['baseline.json','default.json','staged-fusion.json']]
for p in policies[:2]:(corpus/'policies'/(p['id']+'.json')).write_text(json.dumps(p,indent=2)+'\n')
freeze_candidates(corpus,{'policies':policies,'training_membership_sha256':identity,'provenance':'Fixed prior development winner, transferred without adaptation.'},ticket/'scripts/179-run-rich-full-precision.py')
(out/'selection.json').write_text(json.dumps({'format':'kiln-policy-selection/1','membership_sha256':identity,'selected_policy':'staged-fusion',
 'scope':'Fixed transfer from prior development selection; no ranking on this corpus',
 'development_selection':str(ticket/'sources/staged-fusion-results-v1/selection.json')},indent=2)+'\n')
print(len(rows),audit['category_counts'])
