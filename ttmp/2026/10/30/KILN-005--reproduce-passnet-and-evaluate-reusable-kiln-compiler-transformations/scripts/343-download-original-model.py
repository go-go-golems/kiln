#!/usr/bin/env python3
"""Download every pinned original checkpoint file, verifying sizes and content hashes."""
import argparse,concurrent.futures,hashlib,json,threading,time,urllib.request
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);args=parser.parse_args();root=args.root.resolve();plan=json.loads((root/'model-download-plan.json').read_text());output=root/'model-original';output.mkdir(exist_ok=True);receipt=root/'model-download-v1.json'
if receipt.exists():raise ValueError('Preserve existing job receipt; observe the actual process before recovering')
lock=threading.RLock();state={'format':'kiln-original-model-download/1','status':'running','driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'plan_sha256':hashlib.sha256((root/'model-download-plan.json').read_bytes()).hexdigest(),'repository':plan['repository'],'revision':plan['revision'],'expected_bytes':plan['bytes'],'files':{row['name']:{'status':'pending','bytes':0} for row in plan['files']}}
def save():
 with lock:
  temporary=receipt.with_suffix('.tmp');temporary.write_text(json.dumps(state,indent=2)+'\n');temporary.replace(receipt)
def update(name,**values):
 with lock:state['files'][name].update(values);save()
def hashes(path):
 sha=hashlib.sha256();git=hashlib.sha1(('blob '+str(path.stat().st_size)+'\0').encode())
 with path.open('rb') as file:
  while chunk:=file.read(8*1024*1024):sha.update(chunk);git.update(chunk)
 return sha.hexdigest(),git.hexdigest()
def download(row):
 name=row['name'];destination=output/name
 if destination.parent!=output:raise ValueError('Unexpected nested model path')
 partial=destination.with_suffix(destination.suffix+'.part')
 try:
  for attempt in range(3):
   start=partial.stat().st_size if partial.exists() else 0;update(name,status='downloading',attempt=attempt+1,bytes=start)
   try:
    if not destination.exists():
     request=urllib.request.Request(row['url'],headers={'Range':f'bytes={start}-'} if start else {})
     with urllib.request.urlopen(request,timeout=60) as response:
      if start and response.status!=206:start=0
      elif start and not response.headers.get('Content-Range','').startswith(f'bytes {start}-'):raise ValueError('Unexpected resume range')
      with partial.open('ab' if start else 'wb') as file:
       observed=start;last=time.monotonic()
       while chunk:=response.read(8*1024*1024):
        file.write(chunk);observed+=len(chunk)
        if time.monotonic()-last>10:update(name,bytes=observed);last=time.monotonic()
     if partial.stat().st_size!=row['size']:raise ValueError('Downloaded size differs from pinned model metadata')
     partial.rename(destination)
    update(name,status='verifying',bytes=destination.stat().st_size)
    sha,git=hashes(destination)
    assert destination.stat().st_size==row['size']
    assert sha==row['sha256'] if row['sha256'] else git==row['git_blob_sha1'],'Checkpoint content hash differs'
    update(name,status='verified',bytes=destination.stat().st_size,sha256=sha,git_blob_sha1=git);print('VERIFIED',name,flush=True);return
   except Exception as error:
    update(name,last_error=str(error))
    if destination.exists() or attempt==2:raise
  raise RuntimeError('Unreachable retry limit')
 except Exception as error:update(name,status='failed',error=str(error));raise
save()
try:
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:list(executor.map(download,plan['files']))
 state['status']='complete'
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps({'status':state['status'],'verified':sum(row['status']=='verified' for row in state['files'].values())},indent=2),flush=True)
