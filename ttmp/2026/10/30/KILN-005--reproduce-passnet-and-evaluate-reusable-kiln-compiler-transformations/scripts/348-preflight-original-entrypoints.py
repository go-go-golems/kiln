#!/usr/bin/env python3
"""Test the original entry scripts' repository discovery before model inference."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];up=p/'sources/upstream';shipping=json.loads((up/'pass_agent/datasets/passbench_demo_dataset_200.jsonl').read_text().splitlines()[0]);canonical=(up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()[0];records=[]
for label,sample in [('shipping_smoke',shipping['sample_dir']),('canonical_first',canonical)]:
 path=up/sample/'entry.sh';expected_root=path.resolve().parent.parent
 row={'label':label,'sample':sample,'entry_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'computed_repository_root':str(expected_root),'module_present':(expected_root/'pass_bench/__init__.py').is_file()}
 if not row['module_present']:
  command=['bash',str(path.resolve())];result=subprocess.run(command,cwd=path.parent,text=True,capture_output=True)
  row.update(command=command,returncode=result.returncode,stdout=result.stdout,stderr=result.stderr)
 else:row['scope']='Discovery precondition does not fail; do not start an unplanned benchmark in this preflight'
 records.append(row)
with (p/'sources/agent-runtime-bootstrap-v1/original-entry-preflight-v1.json').open('x') as file:file.write(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
