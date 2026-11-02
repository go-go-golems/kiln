#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'sources'
for dtype in ['f16','bf16']:
    (root/f'typed-transpose-{dtype}.kiln.js').write_text(f'project("typed-transpose-{dtype}").program(({{x}}) => ({{out: N.transpose(x,0,1)}}), {{x: k.tensor([2,3], "{dtype}")}});\n')
