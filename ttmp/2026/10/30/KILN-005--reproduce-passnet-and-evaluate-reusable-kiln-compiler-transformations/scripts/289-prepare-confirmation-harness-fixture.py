#!/usr/bin/env python3
"""Exercise fixed-pair infrastructure on synthetic graphs, not confirmation data."""
import hashlib,json,shutil,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from prepare_study import prepare
from compiler_confirmation import freeze,compile_pair
s=p/'sources';root=s/'reshape-confirmation-harness-fixture-v1';root.mkdir();up=root/'upstream';up.mkdir();declarations=root/'declaration';declarations.mkdir()
samples=[]
for kind in ['matrix','reduction']:
 graph=f'graphs/float32/samples/fixture/{kind}/case';directory=up/graph;directory.mkdir(parents=True);sample='samples/train/'+kind;listing=up/sample;listing.mkdir(parents=True);(listing/'graph_list.txt').write_text(graph+'\n');samples.append(sample)
 expression='torch.matmul(in_0,in_1).transpose(1,2).reshape(2,5,3)' if kind=='matrix' else 'torch.sum(in_0,dim=1,keepdim=True)'
 (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,in_0'+(',in_1' if kind=='matrix' else '')+'):\n  return ('+expression+',)\n')
 (directory/'input_meta.py').write_text('')
 shapes=[[2,1,5,7],[2,1,7,3]] if kind=='matrix' else [[3,7]]
 (directory/'weight_meta.py').write_text('\n'.join('class Meta'+str(i)+':\n name="in_'+str(i)+'"\n shape='+repr(shape)+'\n dtype="torch.float32"\n device="cuda:0"\n mean=0.0\n std=1.0\n' for i,shape in enumerate(shapes)))
(up/'train.txt').write_text('\n'.join(samples)+'\n');(up/'eval.txt').write_text('');(declarations/'prior.json').write_text('{"variants":[]}\n')
spec=json.loads((s/'reshape-confirmation-selection-v2.json').read_text());spec.update(salt='independent-execution-fixture',sample_list='train.txt',evaluation_list='eval.txt',excluded_manifests=['prior.json'],heldout_per_category=1,max_tasks=2)
config=declarations/'selection.json';config.write_text(json.dumps(spec,indent=2)+'\n')
shutil.copytree(s/'reshape-confirmation-compiler-sources-v1',declarations/'reshape-confirmation-compiler-sources-v1');shutil.copyfile(s/'reshape-confirmation-node-dependencies-v1.json',declarations/'reshape-confirmation-node-dependencies-v1.json')
plan=json.loads((s/'reshape-confirmation-declaration-v2.json').read_text());plan.update(scope='Independent synthetic execution-harness fixture; no optimization/generalization inference',selection_spec_sha256=hashlib.sha256(config.read_bytes()).hexdigest(),exclusion_sha256=hashlib.sha256((declarations/'prior.json').read_bytes()).hexdigest());declaration=declarations/'plan.json';declaration.write_text(json.dumps(plan,indent=2)+'\n')
prepare(up,root/'corpus',config);freeze(root/'corpus',declaration,repo);compile_pair(root/'corpus',root/'artifacts',Path('/tmp/kiln-passnet-reshape-baseline-c15c610'),repo)
print('Independent fixture source pair compiled and qualified')
