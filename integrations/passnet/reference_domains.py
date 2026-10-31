"""Source-derived input domains for synthetic compiler checks, not runtime constants."""
import argparse
import json
from pathlib import Path
import torch
from fx_trace import trace_module


class ReferenceDomainError(ValueError):
    """A source expression needs a stronger domain proof, not a new lowering."""


def constraints_for_graph(graph, input_names=None):
    """Infer a bounded reference-only domain through sign-preserving views/casts."""
    placeholders=[node for node in graph.graph.nodes if node.op=='placeholder']
    if input_names is None:input_names=['v'+str(i) for i in range(len(placeholders))]
    if len(input_names)!=len(placeholders):raise ValueError('Reference-domain input binding count differs')
    names=dict(zip(placeholders,input_names))
    def input_root(node):
        if node in names:return names[node]
        if isinstance(node,torch.fx.Node) and node.op=='call_method' and node.target in ('view','reshape','contiguous','transpose','permute','float','to'):
            return input_root(node.args[0])
        raise ReferenceDomainError('Cannot establish batch-normalization variance input domain')
    constraints=[]
    for node in graph.graph.nodes:
        if node.op=='call_function' and node.target is torch.nn.functional.batch_norm:
            value=node.kwargs.get('running_var',node.args[2] if len(node.args)>2 else None)
            constraint={'input':input_root(value),'kind':'positive','offset':0.1}
            if constraint not in constraints:constraints.append(constraint)
    return constraints


def attach_reference_data(script, inputs, constraints):
    """Use existing Project.data for compiler checks; runtime arguments stay free."""
    if not constraints:return script
    if not script.startswith('project('):raise ValueError('Expected generated project script')
    script='const passnetProject = '+script
    script+='const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph());\n'
    for constraint in constraints:
        name=constraint['input']
        if name not in inputs or constraint['kind']!='positive' or constraint['offset']!=0.1:
            raise ValueError('Unsupported synthetic reference domain')
        script+=f'for (let i=0; i<passnetReferenceInputs.{name}.data.length; i++) passnetReferenceInputs.{name}.data[i] = Math.abs(passnetReferenceInputs.{name}.data[i]) + 0.1;\n'
    return script+'passnetProject.data(passnetReferenceInputs);\n'


def reference_domains(directory,upstream):
    from corpus import load_module,read_manifest
    manifest=read_manifest(directory);records=[]
    for record in manifest['variants']:
        graph=trace_module(load_module(upstream/record['graph']/'model.py').GraphModule())
        order=record.get('source_input_order',list(range(len(record['inputs']))))
        constraints=constraints_for_graph(graph,['v'+str(order.index(i)) for i in range(len(order))])
        if any(c['input'] not in record['inputs'] for c in constraints):raise ValueError('Variance is not a manifest input')
        records.append({'graph':record['graph'],'constraints':constraints})
    return {'format':'kiln-reference-domains/1','membership_sha256':manifest['membership_sha256'],
            'scope':'Synthetic compiler reference checks only; GPU validation uses source inputs.','records':records}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--corpus',type=Path,required=True);p.add_argument('--upstream',type=Path,required=True);args=p.parse_args()
    output=args.corpus/'reference-domains.json'
    if output.exists():raise ValueError('Reference domains already frozen')
    output.write_text(json.dumps(reference_domains(args.corpus,args.upstream),indent=2)+'\n')


if __name__=='__main__':main()
