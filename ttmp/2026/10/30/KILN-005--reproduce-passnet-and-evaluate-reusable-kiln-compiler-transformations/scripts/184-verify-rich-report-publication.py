#!/usr/bin/env python3
"""Verify published report body and exact vault remote-tracking revision."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1]
source=p/'reference/12-milestone-report-richer-fusion-policy-learning-and-explicit-reference-precision.md'
vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc');relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Rich Fusion Policy Learning and Reference Precision.md')
body=lambda raw:raw.split('---',2)[2].lstrip()
if body(source.read_text())!=body((vault/relative).read_text()):raise ValueError('Published report body differs')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=vault,text=True).strip()
remote=subprocess.check_output(['git','rev-parse','origin/main'],cwd=vault,text=True).strip()
if head!=remote:raise ValueError('Vault push not reflected in origin/main')
if subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=vault)!=(vault/relative).read_bytes():raise ValueError('Vault note differs from committed bytes')
result={'vault_revision':head,'origin_main':remote,'note':str(vault/relative),'report_body_sha256':hashlib.sha256(body(source.read_text()).encode()).hexdigest(),'report_revision':'fce41a3','reMarkable':'Progress 08 upload blocked by automatic approval review; no upload occurred; earlier deliveries preserved'}
(p/'sources/rich-report-publication.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
