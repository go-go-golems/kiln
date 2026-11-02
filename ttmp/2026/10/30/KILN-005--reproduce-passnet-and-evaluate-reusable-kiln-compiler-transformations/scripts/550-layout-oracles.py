"""Regenerate independent PyTorch layout semantic fixtures and source census."""
import ast,json,pathlib,collections,torch
root=pathlib.Path.cwd();cases=[]
def record(shape,op,**options):
 x=torch.arange(torch.tensor(shape).prod().item(),dtype=torch.float32).reshape(shape)-5
 y=torch.nn.functional.pad(x,**options) if op=='pad' else torch.roll(x,**options)
 cases.append(dict(op=op,input=dict(shape=shape,data=x.flatten().tolist()),options=options,output=dict(shape=list(y.shape),data=y.flatten().tolist())))
for mode in ['constant','reflect','replicate','circular']:
 for pad in [[1,2],[-1,2],[2,-1],[-1,-1],[0,0]]:record([2,5],'pad',pad=pad,mode=mode,value=3.5 if mode=='constant' else 0)
 record([1,2,4,5],'pad',pad=[1,2,-1,2],mode=mode,value=-2 if mode=='constant' else 0)
record([2,3,4],'pad',pad=[0,0,1,0,0,0],mode='constant',value=0)
record([2,3],'pad',pad=[],mode='constant',value=0)
for shifts,dims in [(1,None),(-17,None),([2,-1],[0,1]),([1,3],[1,1]),([0],[-1]),([7,-5],[-2,-1])]:record([2,5],'roll',shifts=shifts,dims=dims)
path=root/'packages/kiln/test/fixtures/layout-pytorch.json';path.write_text(json.dumps(dict(torch_version=torch.__version__,cases=cases),indent=2)+'\n')
census=collections.Counter();examples={}
for path in (root/'sources/passnet/upstream/graphs').rglob('model.py'):
 try:tree=ast.parse(path.read_text())
 except SyntaxError:continue
 for node in ast.walk(tree):
  if isinstance(node,ast.Call):
   name=ast.unparse(node.func)
   if name in ['torch.nn.functional.pad','torch.roll','torch.split','torch.chunk'] or name.endswith(('.split','.chunk')):
    key=name if name.startswith('torch.') else name.rsplit('.',1)[-1]
    if key=='torch.nn.functional.pad':
     mode=next((ast.unparse(k.value) for k in node.keywords if k.arg=='mode'),ast.unparse(node.args[2]) if len(node.args)>2 else "'constant'");key+=' mode='+mode
    census[key]+=1;examples.setdefault(key,dict(path=str(path.relative_to(root)),call=ast.unparse(node)))
out=root/'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/layout-census.json';out.write_text(json.dumps(dict(counts=dict(census),examples=examples),indent=2)+'\n')
print(len(cases),'oracle cases');print(dict(census))
