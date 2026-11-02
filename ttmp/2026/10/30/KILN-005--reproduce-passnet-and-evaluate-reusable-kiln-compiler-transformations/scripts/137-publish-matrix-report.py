#!/usr/bin/env python3
"""Append-only publication of the matrix milestone report to the vault."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]
source=p/'reference/10-milestone-report-matrix-semantics-canonical-bindings-and-numerical-acceptance.md'
body=source.read_text().split('---',2)[2].strip()+'\n'
vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc')
target=vault/'Projects/2026/10/31/ARTICLE - Kiln - Matrix Semantics Canonical Bindings and Numerical Acceptance.md'
header='---\ntitle: "Kiln: Matrix Semantics, Canonical Operand Bindings and Numerical Acceptance"\naliases: [Kiln Matrix and Numerical Audit Milestone]\ntags: [article, compilers, cuda, optimization, research]\nstatus: active\ntype: article\ncreated: 2026-10-31\nrepo: /home/manuel/code/wesen/kiln/worktrees/passnet\nticket: KILN-005\nsource_revision: ce01a6a\n---\n\n'
with target.open('x') as f:f.write(header+body)
assert target.read_text().split('---',2)[2].strip()==body.strip()
print(target)
