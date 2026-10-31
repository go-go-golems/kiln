#!/usr/bin/env python3
"""Export the original framework's own lockfile, preserving published artifact hashes."""
import hashlib,json,subprocess,tarfile
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/agent-runtime-bootstrap-v1';temporary=Path('/tmp/kiln005-r2e-lock-export');temporary.mkdir(exist_ok=True)
with tarfile.open(p/'r2e-gym-source.tar.gz') as tar:
 prefix=tar.getnames()[0].split('/')[0]
 for name in ['pyproject.toml','uv.lock']:(temporary/name).write_bytes(tar.extractfile(prefix+'/'+name).read())
command=['uv','export','--frozen','--no-dev','--no-emit-project','--offline','--cache-dir','/tmp/kiln005-agent-uv-cache','--project',str(temporary),'--format','requirements.txt','--output-file',str((p/'r2e-locked-requirements.txt').resolve())]
r=subprocess.run(command,capture_output=True,text=True)
(p/'lock-export-v1.log').write_text(r.stdout+r.stderr)
receipt={'command':command,'returncode':r.returncode,'uv':subprocess.check_output(['uv','--version'],text=True).strip(),'lock_sha256':hashlib.sha256((temporary/'uv.lock').read_bytes()).hexdigest(),'initial_failure':'uv export with default cache: failed to open /home/manuel/.cache/uv/sdists-v9/.git: Read-only file system (os error 30)'}
if r.returncode==0:receipt['requirements_sha256']=hashlib.sha256((p/'r2e-locked-requirements.txt').read_bytes()).hexdigest()
with (p/'lock-export-v1.json').open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2));raise SystemExit(r.returncode)
