#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/third-task'
s=(p/'000.kiln.js').read_text().replace('return {out0: v7};','return {conv: v4, relu: v5, residual: v6, out0: v7};')
(p/'stages.kiln.js').write_text(s)
