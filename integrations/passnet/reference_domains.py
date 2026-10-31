"""Source-derived input domains for synthetic compiler checks, not runtime constants."""
import argparse
import json
from pathlib import Path
import torch
from torch.fx import symbolic_trace
from corpus import load_module,read_manifest


def reference_domains(directory,upstream):
    manifest=read_manifest(directory);records=[]
    for record in manifest['variants']:
        graph=symbolic_trace(load_module(upstream/record['graph']/'model.py').GraphModule())
        names={node:'v'+str(i) for i,node in enumerate(graph.graph.nodes) if node.op=='placeholder'}
        def input_root(node):
            if node in names:return names[node]
            if isinstance(node,torch.fx.Node) and node.op=='call_method' and node.target in ('view','reshape','contiguous','transpose','permute','float','to'):
                return input_root(node.args[0])
            raise ValueError(f'{record["graph"]}: cannot establish variance input domain')
        constraints=[]
        for node in graph.graph.nodes:
            if node.op=='call_function' and node.target is torch.nn.functional.batch_norm:
                value=node.kwargs.get('running_var',node.args[2] if len(node.args)>2 else None)
                name=input_root(value)
                if name not in record['inputs']:raise ValueError('Variance is not a manifest input')
                constraint={'input':name,'kind':'positive','offset':0.1}
                if constraint not in constraints:constraints.append(constraint)
        records.append({'graph':record['graph'],'constraints':constraints})
    return {'format':'kiln-reference-domains/1','membership_sha256':manifest['membership_sha256'],
            'scope':'Synthetic compiler reference checks only; GPU validation uses source inputs.','records':records}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--corpus',type=Path,required=True);p.add_argument('--upstream',type=Path,required=True);args=p.parse_args()
    output=args.corpus/'reference-domains.json'
    if output.exists():raise ValueError('Reference domains already frozen')
    output.write_text(json.dumps(reference_domains(args.corpus,args.upstream),indent=2)+'\n')


if __name__=='__main__':main()
