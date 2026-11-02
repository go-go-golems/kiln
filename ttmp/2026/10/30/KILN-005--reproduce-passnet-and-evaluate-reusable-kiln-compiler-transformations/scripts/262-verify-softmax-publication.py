#!/usr/bin/env python3
"""Verify exact softmax-report body and committed/pushed vault state."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc')
source=p/'reference/16-milestone-report-softmax-source-semantics-and-complete-benchmark-qualification.md'
relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Softmax Source Semantics and Complete Benchmark Qualification.md')
body=lambda value:value.split('---',2)[2].lstrip()
if body(source.read_text())!=body((vault/relative).read_text()):raise ValueError('Published body differs from ticket report')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=vault,text=True).strip()
remote=subprocess.check_output(['git','rev-parse','origin/main'],cwd=vault,text=True).strip()
advertised=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],cwd=vault,text=True).split()[0]
if head!=remote or head!=advertised:raise ValueError('Vault push not reflected in advertised remote state')
if subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=vault)!=(vault/relative).read_bytes():raise ValueError('Vault note differs from committed bytes')
receipt={'vault_revision':head,'origin_main':remote,'advertised_main':advertised,'note':str(vault/relative),'report_body_sha256':hashlib.sha256(body(source.read_text()).encode()).hexdigest(),
         'guide_delivery':'Updated guide remains local, awaiting the earlier explicit approval request after automatic-review rejection; no new export attempted'}
(p/'sources/softmax-report-publication.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
