#!/usr/bin/env python3
"""Presence-only diagnostic of the upstream documented provider settings.

Run only after notifying the user; never print or archive credential values.
"""
import json,os
from pathlib import Path
keys=['LLM_BASE_URL','OPENAI_API_KEY','ANTHROPIC_API_KEY']
result={'scope':'Presence flags only for documented PassAgent provider settings; no values retained',
        'present':{key:bool(os.environ.get(key)) for key in keys}}
p=Path(__file__).resolve().parents[1]
(p/'sources/passagent-provider-presence.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
