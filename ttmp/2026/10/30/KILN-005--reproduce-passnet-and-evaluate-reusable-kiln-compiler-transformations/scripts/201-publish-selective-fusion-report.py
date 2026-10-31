#!/usr/bin/env python3
"""Append a new milestone article to the authorized Obsidian vault."""
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists())
report=p/'reference/13-milestone-report-selective-consumer-fusion-implementation-and-fresh-evaluation.md'
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
if subprocess.check_output(['git','show',revision+':'+str(report.relative_to(repo))],cwd=repo)!=report.read_bytes():raise ValueError('Commit the final report before publication')
target=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/10/31/ARTICLE - Kiln - Selective Consumer Fusion and Fresh Evaluation.md')
front='''---
title: "Kiln: Selective Consumer Fusion and Fresh Evaluation"
aliases: [Kiln Selective Fusion Implementation and Confirmation]
tags: [article, compilers, cuda, optimization, research]
status: active
type: article
created: 2026-10-31
repo: /home/manuel/code/wesen/kiln/worktrees/passnet
ticket: KILN-005
source_revision: 51b45eb
compiler_revision: d324850
selection_revision: 731e834
report_revision: '''+revision+'''
---

'''
with target.open('x') as f:f.write(front+report.read_text().split('---',2)[2].lstrip())
print(target)
