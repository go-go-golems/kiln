#!/usr/bin/env python3
"""Append the verified singleton reshape compiler milestone to the authorized vault."""
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists())
report=p/'reference/17-milestone-report-singleton-reshape-maps-and-measured-contraction-speedup.md'
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
if subprocess.check_output(['git','show',revision+':'+str(report.relative_to(repo))],cwd=repo)!=report.read_bytes():raise ValueError('Commit report before publication')
target=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/10/31/ARTICLE - Kiln - Singleton Reshape Maps and Measured Contraction Speedup.md')
front='''---
title: "Kiln: Singleton Reshape Maps and Measured Contraction Speedup"
aliases: [Kiln Singleton Reshape Contraction Tiling]
tags: [article, compilers, cuda, optimization, research]
status: active
type: article
created: 2026-10-31
repo: /home/manuel/code/wesen/kiln/worktrees/passnet
ticket: KILN-005
source_revision: fed37d1
baseline_revision: d71eccd
evaluation_revision: fed37d1
report_revision: '''+revision+'''
---

'''
with target.open('x') as f:f.write(front+report.read_text().split('---',2)[2].lstrip())
print(target)
