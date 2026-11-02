#!/usr/bin/env python3
"""Append the committed exact-GELU technical milestone to the authorized vault."""
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());report=next((p/'reference').glob('19-*.md'))
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert subprocess.check_output(['git','show',revision+':'+str(report.relative_to(repo))],cwd=repo)==report.read_bytes(),'Commit report before publication'
target=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/10/31/ARTICLE - Kiln - Exact GELU and Complete Source Qualification.md')
front='''---
title: "Kiln: Exact GELU and Complete Source Qualification"
aliases: [Kiln Exact GELU Source Contracts]
tags: [article, compilers, cuda, numerical-methods, research]
status: active
type: article
created: 2026-10-31
repo: /home/manuel/code/wesen/kiln/worktrees/passnet
ticket: KILN-005
implementation_revision: d316241
matching_repair_revision: f1e5518
report_revision: '''+revision+'''
---

'''
with target.open('x') as file:file.write(front+report.read_text().split('---',2)[2].lstrip())
print(target)
