"""Archive all 25 local source and compiler artifacts for the structural batch."""

import hashlib
import json
import subprocess
from pathlib import Path

sources = Path(__file__).resolve().parent.parent / 'sources'
directory = sources / 'stack-unbind-batch-local-compile-v1'
archive = sources / 'stack-unbind-batch-local-compile-v1.tar.gz'
assert not archive.exists()
receipt = json.loads((directory / 'receipt.json').read_text())
assert len(receipt['records']) == 3 and all(row['status'] == 'compiled' for row in receipt['records'])
subprocess.run(['tar', '-czf', str(archive), '-C', str(sources), directory.name], check=True)
manifest = {'format': 'kiln-local-compile-archive/1', 'file': archive.name,
            'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
            'bytes': archive.stat().st_size,
            'members': len(subprocess.check_output(['tar', '-tzf', str(archive)], text=True).splitlines())}
(sources / 'stack-unbind-batch-local-compile-archive-v1.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
