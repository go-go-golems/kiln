#!/usr/bin/env python3
"""Compare complete emitted program bodies, independently of claimed fingerprints."""
import hashlib
import json
from pathlib import Path

ticket=Path(__file__).resolve().parent.parent
root=ticket/'sources/native-agent-compilation-v1'
out=ticket/'sources/native-agent-executable-alias-v1.json'
assert not out.exists()
read=lambda path:json.loads(path.read_text())
base=read(root/'baseline/compile-receipt.json')
candidate=read(root/'attempt-0002/compile-receipt.json')
assert [r['graph'] for r in base['records']]==[r['graph'] for r in candidate['records']]
records=[]
for before,after in zip(base['records'],candidate['records']):
    assert before['status']==after['status']=='compiled'
    left=read(root/'baseline'/before['artifact'])
    right=read(root/'attempt-0002'/after['artifact'])
    # These three fields are diagnostic/provenance metadata. Keep all executable,
    # launch, I/O, layout and scratch-buffer fields in the compared objects.
    for value in [left,right]:
        for key in ['name','source','compiler_policy']:value.pop(key,None)
    assert left==right,before['graph']
    digest=hashlib.sha256(json.dumps(left,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
    records.append({'graph':before['graph'],'complete_program_bodies_equal':True,
                    'comparison_encoding_sha256':digest})
result={'status':'passed','graphs':len(records),'records':records,
        'scope':'Complete exported program body equality excluding name/source/compiler_policy metadata; no timing contrast exists in these artifacts'}
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':'passed','graphs':len(records),'timing_contrast':False}))
