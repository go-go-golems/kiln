#!/usr/bin/env python3
"""Preserve this turn's unfinished native JSON prototype, then restore its base.

The user selected Pi/LunaRoute before this prototype was tested. This touches
only the driver modified by this session and retains its complete diff.
"""
import hashlib
import json
from pathlib import Path
import subprocess

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
name='integrations/passnet/run_native_policy_agent.py';path=repo/name
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert revision=='27229c216ea0290b978212ab44ecca5b645a00b6'
assert 'schema-constrained JSON actions' in path.read_text()
output=ticket/'sources/native-json-action-prototype-v1';output.mkdir()
patch=subprocess.check_output(['git','diff','--',name],cwd=repo)
assert patch
(output/'driver.patch').write_bytes(patch)
base=subprocess.check_output(['git','show',revision+':'+name],cwd=repo)
record={'status':'archived_unvalidated_prototype','base_revision':revision,'path':name,
        'prototype_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'patch_sha256':hashlib.sha256(patch).hexdigest(),'restored_sha256':hashlib.sha256(base).hexdigest(),
        'reason':'User explicitly requested Pi coding agent with a LunaRoute GLM route; use its native tools instead of extending the local response parser.',
        'validation':'Prototype was not tested or run against a model. The committed v2 driver is restored unchanged.'}
(output/'archive.json').write_text(json.dumps(record,indent=2)+'\n')
path.write_bytes(base)
print(json.dumps(record,indent=2))
