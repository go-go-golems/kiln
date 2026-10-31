#!/usr/bin/env python3
"""Keep report prose and its authoring source aligned after typography review."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]
replacements={'is0.1':'is 0.1','remains200':'remains 200','and2060':'and 2060','remains27':'remains 27','and338':'and 338','contains200':'contains 200','is200':'is 200','with2060':'with 2060','The338':'The 338','contain273':'contain 273','all2060':'all 2060','Complete200':'Complete 200','occupy61066575648':'occupy 61066575648','contains25':'contains 25','and61084185821':'and 61084185821','Its61095803040':'Its 61095803040','finds579':'finds 579','tensors:338':'tensors: 338','and241':'and 241','with30532122624':'with 30532122624','context40960':'context 40960','the262144':'the 262144','a131072':'a 131072','the40960':'the 40960','LiteLLM1.':'LiteLLM 1.','Torch2.':'Torch 2.','Triton3.':'Triton 3.','verifies14876':'verifies 14876','files,603':'files, 603','symlinks,201':'symlinks, 201','exits126':'exits 126','reports137':'reports 137','approximately1.':'approximately 1.','to27':'to 27','current-release200':'current-release 200','Design18':'Design 18','Steps140':'Steps 140','Scripts338':'Scripts 338','are06c183e andfe1a0b9':'are 06c183e and fe1a0b9','Table4':'Table 4'}
for path in [p/'scripts/385-author-original-agent-report.py',p/'reference/20-original-passagent-execution-and-experimental-identity.md',p/'sources/agent-runtime-bootstrap-v1/original-agent-report-body.md']:
 s=path.read_text()
 for old,new in replacements.items():s=s.replace(old,new)
 path.write_text(s)
