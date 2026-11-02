"""Archive official PyTorch 2.9 mutation and functionalization API pages."""

import datetime
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path

sources = Path(__file__).resolve().parent.parent / 'sources'
directory = sources / 'pytorch-2-9-mutation-docs-v1'
archive = sources / 'pytorch-2-9-mutation-docs-v1.tar.gz'
receipt = sources / 'pytorch-2-9-mutation-docs-archive-v1.json'
assert not directory.exists() and not archive.exists() and not receipt.exists()
directory.mkdir()
records = []
for name in ('torch.Tensor.add_', 'torch.nn.functional.silu', 'torch.func.functionalize'):
    url = f'https://docs.pytorch.org/docs/2.9/generated/{name}.html'
    request = urllib.request.Request(url, headers={'User-Agent': 'Kiln-PassNet-Research/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data, status = response.read(), response.status
    if status != 200 or len(data) < 1000:
        raise RuntimeError(f'Unexpected API page response: {name} {status} {len(data)}')
    filename = name + '.html'
    (directory / filename).write_bytes(data)
    records.append({'name': name, 'url': url, 'file': filename, 'http_status': status,
                    'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
manifest = {'format': 'kiln-source-pages/1',
            'fetched_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'purpose': 'Pinned PyTorch mutation and input fix-up semantics; no implementation code copied',
            'records': records}
(directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
subprocess.run(['tar', '-czf', str(archive), '-C', str(sources), directory.name], check=True)
result = {'format': 'kiln-source-archive/1', 'file': archive.name,
          'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
          'bytes': archive.stat().st_size, 'source_manifest': manifest}
receipt.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'archive': archive.name, 'sha256': result['sha256'],
                  'pages': len(records)}, indent=2))
