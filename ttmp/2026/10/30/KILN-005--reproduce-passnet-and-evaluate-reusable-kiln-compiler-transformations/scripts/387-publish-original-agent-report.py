#!/usr/bin/env python3
"""Append a technical follow-up, commit only that note and verify the remote bytes."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc');relative=Path('Projects/2026/10/31/ARTICLE - Kiln - Original PassAgent Execution and Experimental Identity.md');note=vault/relative;receipt=p/'sources/original-agent-report-publication.json';assert not note.exists() and not receipt.exists()
body=(p/'sources/agent-runtime-bootstrap-v1/original-agent-report-body.md').read_text()
def git(args,cwd=vault):return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
assert git(['branch','--show-current'])=='main'
assert not git(['diff','--cached','--name-only']),'Preserve unrelated staged work'
previous=git(['rev-parse','HEAD']);remote_before=git(['ls-remote','origin','refs/heads/main']).split()[0];assert previous==remote_before,'Do not overwrite remote advancement'
provider=git(['rev-parse','HEAD'],p)
front='''---
title: "Kiln: Original PassAgent Execution and Experimental Identity"
aliases: [Kiln Original Agent Runtime]
tags: [article, compilers, cuda, llm-agents, reproducibility]
status: active
type: article
created: 2026-10-31
repo: /home/manuel/code/wesen/kiln/worktrees/passnet
ticket: KILN-005
implementation_revision: '''+provider+'''
---

'''
with note.open('x') as file:file.write(front+body)
subprocess.run(['git','add','--',str(relative)],cwd=vault,check=True)
assert git(['diff','--cached','--name-only'])==str(relative)
subprocess.run(['git','diff','--cached','--check'],cwd=vault,check=True)
subprocess.run(['git','commit','-m','docs(kiln): explain original agent execution and experimental identity','--',str(relative)],cwd=vault,check=True)
commit=git(['rev-parse','HEAD']);subprocess.run(['git','push','origin','HEAD:main'],cwd=vault,check=True)
remote=git(['ls-remote','origin','refs/heads/main']).split()[0];assert remote==commit
committed=subprocess.check_output(['git','show',commit+':'+str(relative)],cwd=vault);assert committed==note.read_bytes()
assert committed.decode().split('---',2)[2].strip()==body.strip()
value={'format':'kiln-obsidian-report-publication/1','vault_commit':commit,'remote_main':remote,'previous_vault_commit':previous,'path':str(relative),'provider_implementation_revision':provider,'note_sha256':hashlib.sha256(committed).hexdigest(),'body_sha256':hashlib.sha256(body.encode()).hexdigest(),'body_matches_ticket':True,'report_scope':'First genuine original-evaluator feedback; active trajectory, no successful optimization claimed'}
receipt.write_text(json.dumps(value,indent=2)+'\n');print(json.dumps(value,indent=2))
