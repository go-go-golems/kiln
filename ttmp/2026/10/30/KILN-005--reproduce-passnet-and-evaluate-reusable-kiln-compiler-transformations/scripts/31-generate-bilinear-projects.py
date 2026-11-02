#!/usr/bin/env python3
from pathlib import Path
import json
p=Path(__file__).resolve().parents[1];repo=next(r for r in p.parents if (r/'packages/kiln').exists())
fixtures=json.loads((repo/'packages/kiln/test/fixtures/bilinear-pytorch.json').read_text())
out=p/'sources/bilinear';out.mkdir(exist_ok=True)
for i,c in enumerate(fixtures['cases']):
 (out/f'{i:03d}.kiln.js').write_text('project("bilinear-fixture").program(({x}) => ({out:N.resizeBilinear(x,'+json.dumps(c['size'])+')}), {x:k.tensor('+json.dumps(c['shape'])+')});\n')
