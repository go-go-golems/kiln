#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'sources'
for dtype in ['f16','bf16']:
    (root/f'typed-arithmetic-{dtype}.kiln.js').write_text(f'project("typed-arithmetic-{dtype}").program(({{x,y}}) => ({{out: N.mul(N.add(x,y), 0.5), cancellation: N.sub(N.add(x,y),x)}}), {{x: k.tensor([32], "{dtype}"), y: k.tensor([32], "{dtype}")}});\n')
