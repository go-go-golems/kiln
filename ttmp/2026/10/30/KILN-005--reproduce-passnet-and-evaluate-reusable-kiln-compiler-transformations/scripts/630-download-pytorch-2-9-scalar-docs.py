"""Pin the official PyTorch 2.9 API pages consulted for the scalar batch."""
import datetime
import hashlib
import json
import urllib.request
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
destination = ticket / 'sources/pytorch-2-9-scalar-docs-v1'
assert not destination.exists(), 'Preserve earlier source download'
destination.mkdir()
names = ['torch.square', 'torch.nn.functional.leaky_relu',
         'torch.nn.functional.hardsigmoid', 'torch.nn.functional.hardswish',
         'torch.Tensor.expand_as']
records = []
for name in names:
    url = f'https://docs.pytorch.org/docs/2.9/generated/{name}.html'
    request = urllib.request.Request(url, headers={'User-Agent': 'Kiln-PassNet-Research/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read()
        status = response.status
    if status != 200 or len(content) < 1000:
        raise RuntimeError(f'Unexpected API page response: {name} {status} {len(content)}')
    filename = name + '.html'
    (destination / filename).write_bytes(content)
    records.append({'name': name, 'url': url, 'file': filename, 'http_status': status,
                    'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
manifest = {'format': 'kiln-source-pages/1', 'fetched_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'purpose': 'Official pinned-version scalar and layout API semantics; no implementation code copied',
            'records': records}
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
