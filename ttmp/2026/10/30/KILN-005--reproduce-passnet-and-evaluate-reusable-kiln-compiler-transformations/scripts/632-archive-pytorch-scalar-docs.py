"""Package exact official HTML bytes without expanding them in Git diffs."""
import hashlib
import json
import subprocess
from pathlib import Path

sources = Path(__file__).resolve().parent.parent / 'sources'
directory = sources / 'pytorch-2-9-scalar-docs-v1'
manifest = json.loads((directory / 'manifest.json').read_text())
assert len(manifest['records']) == 5
for row in manifest['records']:
    assert hashlib.sha256((directory / row['file']).read_bytes()).hexdigest() == row['sha256']
archive = sources / 'pytorch-2-9-scalar-docs-v1.tar.gz'
assert not archive.exists()
subprocess.run(['tar', '-czf', str(archive), '-C', str(sources), directory.name], check=True)
receipt = {'format': 'kiln-source-archive/1', 'file': archive.name,
           'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
           'bytes': archive.stat().st_size, 'api_pages': len(manifest['records']),
           'source_manifest': manifest}
(sources / 'pytorch-2-9-scalar-docs-archive-v1.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: value for key, value in receipt.items() if key != 'source_manifest'}, indent=2))
