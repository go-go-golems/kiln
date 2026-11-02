"""Archive one ticket source directory with an immutable hash receipt."""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

sources = Path(__file__).resolve().parent.parent / 'sources'
parser = argparse.ArgumentParser()
parser.add_argument('name')
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', args.name):
    parser.error('directory name must be a simple lowercase slug')
directory = sources / args.name
archive = sources / (args.name + '.tar.gz')
receipt = sources / (args.name + '-archive.json')
if not directory.is_dir() or archive.exists() or receipt.exists():
    parser.error('source directory must exist and archive/receipt must be new')
subprocess.run(['tar', '-czf', str(archive), '-C', str(sources), args.name], check=True)
result = {'format': 'kiln-evidence-archive/1', 'file': archive.name,
          'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
          'bytes': archive.stat().st_size,
          'members': len(subprocess.check_output(['tar', '-tzf', str(archive)], text=True).splitlines())}
receipt.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
