"""Preserve all raw paired-task evidence in one source archive."""
import hashlib
import json
import subprocess
from pathlib import Path

study = Path(__file__).resolve().parent.parent / 'sources/fixed-policy-passbench-v1'
archive = study / 'raw-evidence.tar.gz'
assert not archive.exists()
for arm in ['baseline', 'candidate']:
    assert json.loads((study / arm / 'run.json').read_text())['status'] == 'complete'
subprocess.run(['tar', '-czf', str(archive), '-C', str(study),
                'baseline', 'candidate', 'owner.log'], check=True)
members = subprocess.check_output(['tar', '-tzf', str(archive)], text=True).splitlines()
receipt = {'format': 'kiln-fixed-policy-evidence-archive/1',
           'archive': archive.name, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
           'members': len(members), 'bytes': archive.stat().st_size}
(study / 'archive-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
