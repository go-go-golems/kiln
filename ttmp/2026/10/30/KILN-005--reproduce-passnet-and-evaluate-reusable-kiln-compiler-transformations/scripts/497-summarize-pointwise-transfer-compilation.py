"""Compare the frozen pair without implying GPU correctness or performance."""
import json
from pathlib import Path
p=Path(__file__).resolve().parent.parent/'sources/pointwise-transfer-v1'
a=json.loads((p/'baseline/compile-receipt.json').read_text())['records']
b=json.loads((p/'pointwise/compile-receipt.json').read_text())['records']
assert len(a)==len(b)==len(json.loads((p/'corpus/manifest.json').read_text())['variants'])
rows=[]
for x,y in zip(a,b):
 assert x['graph']==y['graph']
 rows.append({'graph':x['graph'],'baseline_status':x['status'],'candidate_status':y['status'],'identical':x.get('fingerprint')==y.get('fingerprint'),'kernel_counts':[x.get('kernel_count'),y.get('kernel_count')],'reference_skipped':[x.get('reference_check',{}).get('skipped'),y.get('reference_check',{}).get('skipped')]})
(p/'comparison.json').write_text(json.dumps({'scope':'Compilation only; no CUDA correctness or performance evidence','records':rows},indent=2)+'\n')
print([(r['identical'],r['kernel_counts']) for r in rows])
