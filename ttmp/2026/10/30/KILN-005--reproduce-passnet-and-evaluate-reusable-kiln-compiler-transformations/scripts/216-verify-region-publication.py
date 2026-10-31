#!/usr/bin/env python3
"""Verify exact region-report body and committed/pushed vault state."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc')
source=p/'reference/14-milestone-report-whole-region-fusion-planning-model-proof-and-fresh-evaluation.md'
relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Whole Region Fusion Planning and Evidence Identity.md')
body=lambda value:value.split('---',2)[2].lstrip()
if body(source.read_text())!=body((vault/relative).read_text()):raise ValueError('Published body differs from ticket report')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=vault,text=True).strip()
remote=subprocess.check_output(['git','rev-parse','origin/main'],cwd=vault,text=True).strip()
if head!=remote:raise ValueError('Vault push not reflected in remote-tracking state')
if subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=vault)!=(vault/relative).read_bytes():raise ValueError('Vault note differs from committed bytes')
receipt={'vault_revision':head,'origin_main':remote,'note':str(vault/relative),'report_body_sha256':hashlib.sha256(body(source.read_text()).encode()).hexdigest(),
         'guide_delivery':'Updated guide remains local, awaiting the earlier explicit approval request after automatic-review rejection; no new export attempted'}
(p/'sources/region-report-publication.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
