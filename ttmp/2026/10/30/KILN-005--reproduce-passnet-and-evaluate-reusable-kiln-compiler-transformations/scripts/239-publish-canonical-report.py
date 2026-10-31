#!/usr/bin/env python3
"""Append the verified canonical-emission milestone to the authorized vault."""
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists())
report=p/'reference/15-milestone-report-canonical-emission-reliable-test-gates-and-transpose-exports.md'
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
if subprocess.check_output(['git','show',revision+':'+str(report.relative_to(repo))],cwd=repo)!=report.read_bytes():raise ValueError('Commit report before publication')
target=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/10/31/ARTICLE - Kiln - Canonical Emission Reliable Validation and Transpose Exports.md')
front='''---
title: "Kiln: Canonical Emission, Reliable Test Gates, and Transpose Exports"
aliases: [Kiln Canonical Emission and Reliable Validation]
tags: [article, compilers, cuda, optimization, research]
status: active
type: article
created: 2026-10-31
repo: /home/manuel/code/wesen/kiln/worktrees/passnet
ticket: KILN-005
source_revision: e0f64dc
transpose_revision: 71fb43d
compiler_revision: e35aa8c
selection_revision: 58133d1
report_revision: '''+revision+'''
---

'''
with target.open('x') as f:f.write(front+report.read_text().split('---',2)[2].lstrip())
print(target)
