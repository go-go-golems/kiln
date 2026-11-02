"""Summarize inference outcomes and losslessly archive verbose streaming events."""
import gzip
import hashlib
import json
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'sources/pi-transformation-lanes-v1'
summary=json.loads((root/'summary.json').read_text())
rows=[]
for lane in summary:
 p=root/lane['lane']/'run';events=p/'events.jsonl'
 raw=events.read_bytes()
 archive=p/'events.jsonl.gz'
 with archive.open('xb') as f:f.write(gzip.compress(raw,mtime=0))
 ready=next(json.loads(line)['value'] for line in raw.splitlines() if json.loads(line)['kind']=='session_ready')
 outcomes=[json.loads(f.read_text()) for f in sorted((p/'task').glob('*.result.json'))]
 rows.append({'lane':lane['lane'],'elapsed_seconds':lane['result']['elapsedMs']/1000,
  'requested_thinking':ready['requestedThinkingLevel'],'effective_thinking':ready['effectiveThinkingLevel'],
  'outcomes':outcomes,'events_sha256':hashlib.sha256(raw).hexdigest(),
  'events_bytes':len(raw),'archive_bytes':archive.stat().st_size})
(root/'analysis.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps([{k:v for k,v in r.items() if k not in ['outcomes','events_sha256']} for r in rows],indent=2))
