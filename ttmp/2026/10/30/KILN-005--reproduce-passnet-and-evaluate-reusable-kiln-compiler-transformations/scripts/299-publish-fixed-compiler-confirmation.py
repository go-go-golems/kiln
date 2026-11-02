#!/usr/bin/env python3
"""Append the committed fixed-source confirmation article to the authorized vault."""
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists())
report=next((p/'reference').glob('18-*.md'))
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert subprocess.check_output(['git','show',revision+':'+str(report.relative_to(repo))],cwd=repo)==report.read_bytes(),'Commit report before publication'
target=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/10/31/ARTICLE - Kiln - Fixed Compiler Confirmation Across Twenty Fresh Model Families.md')
front='''---
title: "Kiln: Fixed Compiler Confirmation Across Twenty Fresh Model Families"
aliases: [Kiln Fixed Reshape Compiler Confirmation]
tags: [article, compilers, cuda, optimization, research]
status: active
type: article
created: 2026-10-31
repo: /home/manuel/code/wesen/kiln/worktrees/passnet
ticket: KILN-005
source_revision: fed37d1
baseline_revision: c15c610
execution_revision: da42245f2adae05f4bd7baf72743d51867b725dd
report_revision: '''+revision+'''
---

'''
with target.open('x') as f:f.write(front+report.read_text().split('---',2)[2].lstrip())
print(target)
