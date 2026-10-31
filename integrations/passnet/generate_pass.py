"""Extract reusable FX match patterns from trusted dataset forward methods.

Pattern bodies originate in the pinned source models, not in generated CUDA.
A captured pattern identity disambiguates metadata-equal literal specializations.
"""
import argparse,ast,copy,hashlib,json
from pathlib import Path
import torch
from corpus import read_manifest
from fx_normalize import trace_pattern,normalize_arguments


def extract_pattern(source,arity):
    tree=ast.parse(source)
    classes=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='GraphModule']
    if len(classes)!=1:raise ValueError('One GraphModule source class required')
    functions=[n for n in classes[0].body if isinstance(n,ast.FunctionDef) and n.name=='forward']
    if len(functions)!=1:raise ValueError('One forward method required')
    function=copy.deepcopy(functions[0]);args=function.args
    if args.vararg or args.kwarg or args.kwonlyargs or args.posonlyargs or args.defaults:raise ValueError('Static positional tensor signature required')
    if not args.args or args.args[0].arg!='self' or len(args.args)!=arity+1:raise ValueError('Source arity differs from manifest')
    args.args=args.args[1:]
    for arg in args.args:arg.annotation=None
    function.name='pattern';function.returns=None;function.decorator_list=[]
    returns=[n for n in ast.walk(function) if isinstance(n,ast.Return)]
    if len(returns)!=1 or function.body[-1] is not returns[0]:raise ValueError('One final return required')
    if any(isinstance(n,ast.Name) and n.id=='self' for n in ast.walk(function)):raise ValueError('Stateful source patterns need explicit lowering')
    value=returns[0].value;singleton=isinstance(value,(ast.Tuple,ast.List)) and len(value.elts)==1
    if singleton:
        if not isinstance(value.elts[0],ast.Name):raise ValueError('Flat tensor singleton required')
        returns[0].value=value.elts[0]
    elif isinstance(value,ast.List):returns[0].value=ast.Tuple(elts=value.elts,ctx=ast.Load())
    if not isinstance(returns[0].value,(ast.Name,ast.Tuple)):raise ValueError('Flat tensor return required')
    if isinstance(returns[0].value,ast.Tuple) and any(not isinstance(n,ast.Name) for n in returns[0].value.elts):raise ValueError('Flat tensor tuple required')
    class PreserveAdd(ast.NodeTransformer):
        def visit_AugAssign(self,node):
            if not isinstance(node.op,ast.Add) or not isinstance(node.target,ast.Name):
                raise ValueError('Automatic match tracing currently supports explicit in-place addition only')
            return ast.copy_location(ast.Assign(targets=[node.target],value=ast.Call(func=ast.Name(id='kiln_iadd',ctx=ast.Load()),args=[ast.Name(id=node.target.id,ctx=ast.Load()),self.visit(node.value)],keywords=[])),node)
    function=PreserveAdd().visit(function)
    imports=[ast.ImportFrom(module='operator',names=[ast.alias(name='iadd',asname='kiln_iadd')],level=0)]+[copy.deepcopy(n) for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom))]
    module=ast.fix_missing_locations(ast.Module(body=imports+[function],type_ignores=[]))
    text=ast.unparse(module)+'\n';namespace={};exec(compile(module,'<trusted-passnet-pattern>','exec'),namespace)
    traced=trace_pattern(namespace['pattern']);normalize_arguments(traced)
    indexes={node:i for i,node in enumerate(traced.graph.nodes)}
    def freeze(value):
        if isinstance(value,torch.fx.Node):return {'node':indexes[value]}
        if isinstance(value,(tuple,list)):return {type(value).__name__:[freeze(v) for v in value]}
        if isinstance(value,dict):return {key:freeze(v) for key,v in sorted(value.items())}
        if isinstance(value,(int,float)):return float(value)
        if value is None or isinstance(value,str):return value
        return str(value)
    key=[{'op':node.op,'target':str(node.target) if node.op!='call_function' else getattr(node.target,'__module__','')+'.'+getattr(node.target,'__name__',str(node.target)),
          'args':freeze(node.args),'kwargs':freeze(node.kwargs)} for node in traced.graph.nodes]
    # Placeholder spelling does not affect argument identity.
    for row in key:
        if row['op']=='placeholder':row['target']='argument'
    return text,[arg.arg for arg in args.args],singleton,json.dumps(key,sort_keys=True)


def generate(directory,upstream,output,runtime_directory):
    manifest=read_manifest(directory)
    if 'membership_sha256' in manifest:raise ValueError('Do not mutate a frozen policy-study corpus')
    if output.exists() or any('specialization' in r for r in manifest['variants']):raise ValueError('Preserve existing generated passes/specializations')
    patterns=[];keys={};records=[]
    for record in manifest['variants']:
        source=(upstream/record['graph']/'model.py').read_text()
        text,args,singleton,key=extract_pattern(source,len(record['inputs']))
        if key not in keys:
            keys[key]=len(patterns);patterns.append({'text':text,'args':args,'singleton':singleton})
        identity=keys[key]
        if patterns[identity]['singleton']!=singleton:raise ValueError('Equivalent patterns have incompatible output containers')
        record['specialization']=[identity]
        records.append({'graph':record['graph'],'pattern':identity,'source_model_sha256':hashlib.sha256(source.encode()).hexdigest()})
    output.mkdir(parents=True)
    singletons=[i for i,p in enumerate(patterns) if p['singleton']]
    runtime='from dispatch import CorpusDispatch\nDISPATCH=CorpusDispatch('+repr(str(runtime_directory))+",include_paths=['/usr/local/cuda/include'])\nSINGLETONS="+repr(singletons)+'''\ndef kiln_generated(*args):
 inputs,identity=args[:-1],args[-1]
 result=DISPATCH(*inputs,specialization=(identity,))
 return result[0] if identity in SINGLETONS else result
'''
    (output/'_kiln_generated_runtime.py').write_text(runtime)
    names=[]
    for identity,pattern in enumerate(patterns):
        name=f'KilnPattern{identity:04d}';names.append(name);args=', '.join(pattern['args'])
        text=pattern['text']+'from _kiln_generated_runtime import kiln_generated\n'
        text+=f'def replacement_args({args}):\n return ({args}, {identity})\ndef replacement_func():\n return kiln_generated\n'
        (output/(name+'.py')).write_text(text)
    (output/'sorted_output_pass_rule_names.json').write_text(json.dumps(names)+'\n')
    (output/'pattern-provenance.json').write_text(json.dumps({'format':'kiln-source-patterns/1','method':'Pattern AST extracted from trusted dataset GraphModule.forward; normalized FX keys deduplicate equivalent signatures; generated callable invokes compiled Kiln only','records':records},indent=2)+'\n')
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(len(records),'variants;',len(patterns),'source-derived patterns')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ['directory','upstream','output','runtime-directory']:p.add_argument('--'+key,type=Path,required=True)
    a=p.parse_args();generate(a.directory,a.upstream,a.output,a.runtime_directory)


if __name__=='__main__':main()
