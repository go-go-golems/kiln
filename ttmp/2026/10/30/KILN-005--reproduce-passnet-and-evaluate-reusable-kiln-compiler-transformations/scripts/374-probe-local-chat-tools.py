#!/usr/bin/env python3
"""Record real chat and function-call responses from the local pinned endpoint."""
import argparse,json,time,urllib.request,urllib.error
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);root=parser.parse_args().root.resolve();receipt=root/'model-api-probe-v1.json';assert not receipt.exists()
base='http://127.0.0.1:8041';state={'format':'kiln-original-model-api-probe/1','status':'running','base_url':base,'requests':[]}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
def request(path,body=None):
 data=None if body is None else json.dumps(body).encode();req=urllib.request.Request(base+path,data=data,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=600) as response:return json.load(response)
save()
try:
 state['health']=request('/health');state['models']=request('/v1/models');state['props']=request('/props');save()
 bodies=[{'model':'Qwen3-30B-A3B','messages':[{'role':'user','content':'Reply with the single word ready.'}],'temperature':0,'max_tokens':4096}, {'model':'Qwen3-30B-A3B','messages':[{'role':'user','content':'Use the file_editor tool to view /workspace/passnet/README.md. Do not answer in text.'}],'tools':[{'type':'function','function':{'name':'file_editor','description':'View a source file','parameters':{'type':'object','properties':{'command':{'type':'string','enum':['view']},'path':{'type':'string'}},'required':['command','path']}}}],'tool_choice':{'type':'function','function':{'name':'file_editor'}},'temperature':0,'max_tokens':4096}]
 for index,body in enumerate(bodies):
  start=time.monotonic();response=request('/v1/chat/completions',body);row={'request':body,'response':response,'elapsed_seconds':time.monotonic()-start};state['requests'].append(row);save()
  choice=response['choices'][0];assert choice['finish_reason']!='length',choice
  message=choice['message']
  if index==0:assert 'ready' in message.get('content','').lower(),message
  else:
   calls=message.get('tool_calls',[]);assert calls and calls[0]['function']['name']=='file_editor',message
   arguments=json.loads(calls[0]['function']['arguments']);assert arguments['command']=='view' and arguments['path']=='/workspace/passnet/README.md',arguments
 state['status']='complete'
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps({'status':state['status'],'requests':len(state['requests']),'error':state.get('error')},indent=2))
