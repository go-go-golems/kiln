#!/usr/bin/env python3
"""Verify exact article body, committed note bytes and advertised pushed revision."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc');source=next((p/'reference').glob('19-*.md'));relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Exact GELU and Complete Source Qualification.md')
body=lambda text:text.split('---',2)[2].lstrip()
assert body(source.read_text())==body((vault/relative).read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=vault,text=True).strip();remote=subprocess.check_output(['git','rev-parse','origin/main'],cwd=vault,text=True).strip();advertised=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],cwd=vault,text=True).split()[0]
assert head==remote==advertised
assert subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=vault)==(vault/relative).read_bytes()
receipt={'vault_revision':head,'origin_main':remote,'advertised_main':advertised,'note':str(vault/relative),'report_body_sha256':hashlib.sha256(body(source.read_text()).encode()).hexdigest(),'guide_delivery':'Updated reMarkable delivery remains pending earlier explicit approval after automatic-review rejection; no new export attempted'}
with (p/'sources/gelu-report-publication.json').open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
