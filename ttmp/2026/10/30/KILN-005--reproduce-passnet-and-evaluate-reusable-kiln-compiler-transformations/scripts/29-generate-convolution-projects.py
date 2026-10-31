#!/usr/bin/env python3
from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]
repo=next(r for r in p.parents if (r/'packages/kiln').exists())
fixtures=json.loads((repo/'packages/kiln/test/fixtures/conv2d-pytorch.json').read_text())
out=p/'sources/convolution';out.mkdir(exist_ok=True)
for i,case in enumerate(fixtures['cases']):
 shapes={k:case[key]['shape'] for k,key in [('x','input'),('w','weight'),('b','bias')]}
 spec=', '.join(f'{key}: k.tensor({json.dumps(shape)})' for key,shape in shapes.items())
 text='project("conv-fixture").program(({x,w,b}) => ({out:N.conv2d(x,w,b,'+json.dumps(case['options'])+')}), {'+spec+'});\n'
 (out/f'{i:03d}.kiln.js').write_text(text)
