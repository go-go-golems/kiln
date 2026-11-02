#!/usr/bin/env python3
"""Preserve completed fixture evidence while the independent cohort remains active."""
import base64,hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];out=p/'sources/singleton-view-native-fixtures-v1';out.mkdir()
remote=r'''
import base64,json
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005');directory=p/'singleton-view-fixtures-v1';rows=json.loads((directory/'gpu-random-receipt.json').read_text());assert len(rows)==12 and all(row['status']=='passed' and len(row['output_max_abs_errors'])==6 and all(error==0 for error in row['output_max_abs_errors']) for row in rows)
paths=[p/name for name in ['singleton-view-fixture-compile-v1.log','singleton-view-fixture-cuda-v1.log','singleton-view-fixture-cuda-v2.log']]+[directory/'compile-receipt.json',directory/'gpu-random-receipt.json']
paths+=list(directory.glob('*.json'))
paths=list(dict.fromkeys(paths));print(json.dumps([{'path':str(path.relative_to(p)),'content':base64.b64encode(path.read_bytes()).decode()} for path in paths]))
'''
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True,check=True);manifest=[]
for row in json.loads(r.stdout):
 relative=Path(row['path']);assert not relative.is_absolute() and '..' not in relative.parts
 path=out/relative;path.parent.mkdir(parents=True,exist_ok=True);raw=base64.b64decode(row['content']);path.write_bytes(raw);manifest.append({'path':str(relative),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Preserved',len(manifest),'native fixture artifacts/logs; cohort remains independent')
