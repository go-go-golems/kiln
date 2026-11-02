#!/usr/bin/env python3
"""Publish a committed ticket report append-only; stage one vault note and verify push."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
for name in ['body','receipt']:parser.add_argument('--'+name,type=Path,required=True)
for name in ['title','note-name','date','scope','implementation-revision']:parser.add_argument('--'+name,required=True)
parser.add_argument('--alias',action='append',default=[]);a=parser.parse_args()
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').is_dir());vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc');body_path=a.body.resolve();receipt=a.receipt.resolve()
assert p in body_path.parents and p in receipt.parents and not receipt.exists()
assert Path(a.note_name).name==a.note_name and a.note_name.endswith('.md') and re.fullmatch(r'\d{4}-\d{2}-\d{2}',a.date)
year,month,day=a.date.split('-');relative=Path('Projects')/year/month/day/a.note_name;note=vault/relative;assert not note.exists()
body=body_path.read_text()
def git(args,cwd=vault):return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
source_revision=git(['rev-parse','HEAD'],repo);implementation=git(['rev-parse',a.implementation_revision],repo)
committed_body=subprocess.check_output(['git','show',source_revision+':'+str(body_path.relative_to(repo))],cwd=repo);assert committed_body==body_path.read_bytes(),'Commit the reviewed source report before publishing'
assert git(['branch','--show-current'])=='main' and not git(['diff','--cached','--name-only'])
previous=git(['rev-parse','HEAD']);remote_before=git(['ls-remote','origin','refs/heads/main']).split()[0];assert previous==remote_before,'Remote/local history changed; inspect before publishing'
metadata={'title':a.title,'aliases':a.alias,'tags':['article','compilers','cuda','reproducibility'],'status':'active','type':'article','created':a.date,'repo':str(repo),'ticket':'KILN-005','implementation_revision':implementation,'report_source_revision':source_revision}
front='---\n'+''.join(key+': '+json.dumps(value)+'\n' for key,value in metadata.items())+'---\n\n';note.parent.mkdir(parents=True,exist_ok=True)
with note.open('x') as file:file.write(front+body)
subprocess.run(['git','add','--',str(relative)],cwd=vault,check=True);assert git(['diff','--cached','--name-only'])==str(relative)
subprocess.run(['git','diff','--cached','--check'],cwd=vault,check=True)
subprocess.run(['git','commit','-m','docs(kiln): '+a.title,'--',str(relative)],cwd=vault,check=True)
commit=git(['rev-parse','HEAD']);subprocess.run(['git','push','origin','HEAD:main'],cwd=vault,check=True);remote=git(['ls-remote','origin','refs/heads/main']).split()[0];assert remote==commit
committed=subprocess.check_output(['git','show',commit+':'+str(relative)],cwd=vault);assert committed==note.read_bytes() and committed.decode().split('---',2)[2].strip()==body.strip()
value={'format':'kiln-obsidian-report-publication/1','vault_commit':commit,'remote_main':remote,'previous_vault_commit':previous,'path':str(relative),'implementation_revision':implementation,'report_source_revision':source_revision,'note_sha256':hashlib.sha256(committed).hexdigest(),'body_sha256':hashlib.sha256(body.encode()).hexdigest(),'body_matches_ticket':True,'report_scope':a.scope}
receipt.write_text(json.dumps(value,indent=2)+'\n');print(json.dumps(value,indent=2))
