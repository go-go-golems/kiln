#!/usr/bin/env python3
"""Build the pinned unmodified server inside the known NVIDIA toolchain image."""
import argparse,hashlib,json,subprocess,tarfile,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);args=parser.parse_args();root=args.root.resolve();receipt=root/'server-build-v1.json'
if receipt.exists():raise ValueError('Preserve prior build; inspect its actual job before any recovery')
archives=json.loads((root/'source-archives.json').read_text());record=next(row for row in archives if row['name']=='llama.cpp');archive=root/record['file'];assert hashlib.sha256(archive.read_bytes()).hexdigest()==record['sha256']
source=root/'llama-src';source.mkdir()
with tarfile.open(archive) as tar:
 prefix=tar.getnames()[0].split('/')[0]
 for member in tar.getmembers():
  relative=Path(member.name).relative_to(prefix)
  if str(relative)=='.':continue
  member.name=str(relative);tar.extract(member,path=source,filter='data')
image='localhost:5000/playback-redaction:base-26.05'
state={'format':'kiln-llama-server-build/1','status':'running','driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'source_revision':record['revision'],'archive_sha256':record['sha256'],'image_id':subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip(),'phases':[]}
def save():
 temporary=receipt.with_suffix('.tmp');temporary.write_text(json.dumps(state,indent=2)+'\n');temporary.replace(receipt)
save()
base=['docker','run','--rm','--gpus','all','--user','1000:1000','-v',str(root)+':/storage','-w','/storage','--entrypoint','cmake',state['image_id']]
commands=[('configure',base+['-S','/storage/llama-src','-B','/storage/llama-build','-G','Ninja','-DCMAKE_BUILD_TYPE=Release','-DGGML_CUDA=ON','-DCMAKE_CUDA_ARCHITECTURES=121a-real','-DLLAMA_BUILD_TESTS=OFF','-DLLAMA_BUILD_EXAMPLES=OFF','-DLLAMA_BUILD_APP=OFF','-DLLAMA_BUILD_SERVER=ON','-DLLAMA_BUILD_UI=OFF','-DLLAMA_USE_PREBUILT_UI=OFF','-DLLAMA_OPENSSL=OFF','-DLLAMA_BUILD_COMMIT='+record['revision']]),('build',base+['--build','/storage/llama-build','--target','llama-server','--parallel','8'])]
try:
 for name,command in commands:
  state['phase']=name;save();started=time.monotonic()
  with (root/('server-'+name+'-v1.log')).open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
  state['phases'].append({'name':name,'command':command,'returncode':r.returncode,'elapsed_seconds':time.monotonic()-started});save()
  if r.returncode:raise RuntimeError(name+' returned '+str(r.returncode))
 binary=root/'llama-build/bin/llama-server';state.update(status='complete',binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),binary=str(binary))
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
