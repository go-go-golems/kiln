#!/usr/bin/env python3
"""Compare report body, committed vault bytes and advertised pushed revision."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc')
source=next((p/'reference').glob('18-*.md'))
relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Fixed Compiler Confirmation Across Twenty Fresh Model Families.md')
body=lambda value:value.split('---',2)[2].lstrip()
assert body(source.read_text())==body((vault/relative).read_text()),'Published body differs'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=vault,text=True).strip()
remote=subprocess.check_output(['git','rev-parse','origin/main'],cwd=vault,text=True).strip()
advertised=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],cwd=vault,text=True).split()[0]
assert head==remote==advertised,'Vault push not reflected in advertised remote'
assert subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=vault)==(vault/relative).read_bytes(),'Committed note differs'
receipt={'vault_revision':head,'origin_main':remote,'advertised_main':advertised,'note':str(vault/relative),'report_body_sha256':hashlib.sha256(body(source.read_text()).encode()).hexdigest(),'guide_delivery':'Updated reMarkable guide remains pending earlier explicit approval after automatic-review rejection; no new export attempted'}
(p/'sources/fixed-compiler-confirmation-publication.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
