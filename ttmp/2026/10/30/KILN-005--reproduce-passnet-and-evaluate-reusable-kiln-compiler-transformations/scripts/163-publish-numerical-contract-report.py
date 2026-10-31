#!/usr/bin/env python3
"""Append-only vault publication of the fully measured numerical-contract milestone."""
from pathlib import Path
p=Path(__file__).resolve().parents[1];source=p/'reference/11-milestone-report-numerical-contracts-and-eleven-complete-benchmark-tasks.md'
body=source.read_text().split('---',2)[2].strip()+'\n'
target=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/10/31/ARTICLE - Kiln - Numerical Contracts Correctness Gates and Eleven Complete Tasks.md')
header='---\ntitle: "Kiln: Numerical Contracts, Correctness Gates, and Eleven Complete Tasks"\naliases: [Kiln Numerical Contract Qualification Milestone]\ntags: [article, compilers, cuda, optimization, research]\nstatus: active\ntype: article\ncreated: 2026-10-31\nrepo: /home/manuel/code/wesen/kiln/worktrees/passnet\nticket: KILN-005\nsource_revision: a620e6e\nreport_revision: 20db6e2\n---\n\n'
with target.open('x') as out:out.write(header+body)
assert target.read_text().split('---',2)[2].strip()==body.strip()
print(target)
