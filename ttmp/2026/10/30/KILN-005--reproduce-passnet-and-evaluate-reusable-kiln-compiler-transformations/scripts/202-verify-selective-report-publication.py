#!/usr/bin/env python3
"""Verify committed/pushed vault publication of the selective-fusion report."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc')
source=p/'reference/13-milestone-report-selective-consumer-fusion-implementation-and-fresh-evaluation.md'
relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Selective Consumer Fusion and Fresh Evaluation.md')
body=lambda value:value.split('---',2)[2].lstrip()
if body(source.read_text())!=body((vault/relative).read_text()):raise ValueError('Published report body differs')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=vault,text=True).strip()
remote=subprocess.check_output(['git','rev-parse','origin/main'],cwd=vault,text=True).strip()
if head!=remote:raise ValueError('Vault remote-tracking revision does not match publication')
if subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=vault)!=(vault/relative).read_bytes():raise ValueError('Vault note differs from committed content')
receipt={'vault_revision':head,'origin_main':remote,'note':str(vault/relative),'report_revision':'4f2d36f',
         'report_body_sha256':hashlib.sha256(body(source.read_text()).encode()).hexdigest(),
         'guide_delivery':'Updated guide is local; fresh reMarkable approval remains pending after earlier automatic-review rejection; no new attempt or delivery claimed'}
(p/'sources/selective-report-publication.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
