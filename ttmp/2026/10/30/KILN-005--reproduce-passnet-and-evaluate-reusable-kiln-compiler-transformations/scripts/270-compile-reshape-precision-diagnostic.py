#!/usr/bin/env python3
"""Compile old/new tensor lowering for the exact failed source fixture."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'packages/kiln/src/std/tensor.js').exists());s=p/'sources';out=s/'singleton-reshape-precision-diagnostic'
out.mkdir(exist_ok=False);tensor=repo/'packages/kiln/src/std/tensor.js';new=tensor.read_bytes();old=subprocess.check_output(['git','show','c15c610:packages/kiln/src/std/tensor.js'],cwd=repo)
source=s/'singleton-reshape-fixtures/006.kiln.js';optimized=s/'singleton-reshape-fixtures/006.json'
# Locate the actual artifact by compile receipt, rather than assume its suffix.
manifest=json.loads((source.parent/'manifest.json').read_text());receipts=json.loads((source.parent/'compile-receipt.json').read_text());index=next(i for i,r in enumerate(manifest['variants']) if r['graph']=='graphs/contraction-tail-float32');row=manifest['variants'][index];compiled=receipts[index]
assert row['script']==source.name and compiled['returncode']==0
(out/'optimized.json').write_bytes((source.parent/compiled['artifact']).read_bytes())
try:
 tensor.write_bytes(old)
 with (out/'baseline-compile.log').open('w') as log:
  subprocess.run(['node','scripts/kiln-export.mjs','--script',str(source.resolve()),'--target','a100','--contraction','separate','--out',str((out/'baseline.json').resolve())],cwd=repo,stdout=log,stderr=subprocess.STDOUT,check=True)
finally:tensor.write_bytes(new)
receipt={'scope':'Diagnostic: same generated fixture, only tensor.js restored to c15c610 for baseline compilation; not a complete historical source snapshot','old_tensor_sha256':hashlib.sha256(old).hexdigest(),'new_tensor_sha256':hashlib.sha256(new).hexdigest(),'fixture_source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'graph':row['graph']}
(out/'compilation.json').write_text(json.dumps(receipt,indent=2)+'\n');print(receipt)
