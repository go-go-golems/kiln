"""Extract reusable FX match patterns from trusted dataset forward methods.

Pattern bodies originate in the pinned source models, not in generated CUDA.
A captured pattern identity disambiguates metadata-equal literal specializations.

Pattern identity is the computation *modulo output order*. PassBench's matcher runs
with match_output=False and binds replacement outputs to the applied pattern's
returning nodes, so two sources returning (a, b) and (b, a) must be one rule. Each
variant records the permutation from the rule's return order to its own outputs.
"""
import argparse,ast,copy,hashlib,json
from dataclasses import dataclass
from pathlib import Path
import torch
from corpus import read_manifest,translate_graph
from fx_normalize import trace_pattern,normalize_arguments


@dataclass(frozen=True)
class Pattern:
    text: str              # generated pattern module source
    args: list             # pattern argument names in canonical (first-use) order
    singleton: bool        # source returned a one-element container
    key: str               # computation identity, independent of return order
    order: list            # canonical argument index -> source argument index
    returns: list          # returned node indices in this source's order


# augmented assignment operator -> the directly imported operator.i<name> a pattern calls instead
# (fx_normalize.trace_pattern autowraps them; TorchDynamo captures x op= y as operator.i<name>)
AUGMENTED={ast.Add:'add',ast.Sub:'sub',ast.Mult:'mul',ast.Div:'truediv',ast.FloorDiv:'floordiv',ast.Mod:'mod',ast.Pow:'pow',
           ast.MatMult:'matmul',ast.BitAnd:'and',ast.BitOr:'or',ast.BitXor:'xor',ast.LShift:'lshift',ast.RShift:'rshift'}
INPLACE_NAMES={name:'kiln_i'+name for name in AUGMENTED.values()}
# x[index] = value -> a bound call of the directly imported operator.setitem, so that the write is a
# pattern node the pattern returns (see drop_dead_statements); fx_normalize.trace_pattern autowraps it
SETITEM='kiln_setitem'


def inplace_call(value):
    if not isinstance(value,ast.Call):return False
    if isinstance(value.func,ast.Name) and (value.func.id in INPLACE_NAMES.values() or value.func.id==SETITEM):return True
    if isinstance(value.func,ast.Attribute) and value.func.attr.endswith('_') and not value.func.attr.startswith('_'):return True
    return any(k.arg=='inplace' and isinstance(k.value,ast.Constant) and k.value.value is True for k in value.keywords)


def drop_dead_statements(function):
    """Remove source statements that do not reach the return, and `x = None` cleanups.

    A source GraphModule may compute values it never returns. The matcher refuses
    patterns with dead code, and TorchDynamo captures only live nodes, so the pattern
    must be the live computation. An in-place call with an unused result is kept when it
    updates an argument or a value read later (as corpus.eliminate_dead_code keeps it).

    Returns the names bound by those kept in-place statements whose results nothing reads,
    in statement order. The matcher rejects a pattern node without users as dead code
    (an in-place call_method is not impure to torch.fx), so extract_pattern returns them,
    and corpus.expose_inplace_results returns the same nodes from the compiled graph.
    """
    *body,ret=function.body
    arguments={a.arg for a in function.args.args}
    # name -> the name it is a view of (x[...] or a view method of a name): an in-place call through a view
    # updates the viewed value, so it is kept when the view or anything it views is read later
    # (corpus.eliminate_dead_code follows the same chain over FX nodes)
    VIEWS={'view','reshape','permute','transpose','expand','expand_as','view_as','unsqueeze','squeeze','flatten','t',
           'contiguous','narrow','select','unfold','detach','as_strided','movedim','swapaxes','unflatten','split','chunk'}
    viewed={}
    for statement in body:
        if isinstance(statement,ast.Assign) and len(statement.targets)==1 and isinstance(statement.targets[0],ast.Name):
            v=statement.value
            if isinstance(v,ast.Subscript) and isinstance(v.value,ast.Name):viewed[statement.targets[0].id]=v.value.id
            elif isinstance(v,ast.Call) and isinstance(v.func,ast.Attribute) and v.func.attr in VIEWS and isinstance(v.func.value,ast.Name):viewed[statement.targets[0].id]=v.func.value.id
    def chain(name):
        out=[name]
        while out[-1] in viewed and viewed[out[-1]] not in out:out.append(viewed[out[-1]])
        return out
    live={n.id for n in ast.walk(ret) if isinstance(n,ast.Name)};kept=[];unused=[];bound=set()
    for statement in reversed(body):
        if isinstance(statement,ast.Assign) and isinstance(statement.value,ast.Constant) and statement.value.value is None:
            continue
        if not isinstance(statement,ast.Assign):raise ValueError(f'Unsupported pattern statement {type(statement).__name__}')
        targets={n.id for t in statement.targets for n in ast.walk(t) if isinstance(n,ast.Name)}
        if targets&live:
            live=(live-targets)|{n.id for n in ast.walk(statement.value) if isinstance(n,ast.Name)}
            kept.append(statement);bound|=targets
        elif inplace_call(statement.value):
            call=statement.value
            receiver=call.func.value if isinstance(call.func,ast.Attribute) and call.func.attr.endswith('_') else call.args[0] if call.args else None
            if not isinstance(receiver,ast.Name):raise ValueError('In-place source statement without a named target')
            if any(n in live or n in arguments for n in chain(receiver.id)):
                if len(statement.targets)!=1 or not isinstance(statement.targets[0],ast.Name):raise ValueError('In-place source statement must bind one name')
                if statement.targets[0].id in bound:raise ValueError(f'{statement.targets[0].id}: an unused in-place result is rebound later')
                live|={n.id for n in ast.walk(call) if isinstance(n,ast.Name)}
                kept.append(statement);unused.append(statement.targets[0].id);bound|=targets
    function.body=[*reversed(kept),ret]
    return unused[::-1]


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
    used=set()
    class PreserveInPlace(ast.NodeTransformer):
        def visit_AugAssign(self,node):
            if type(node.op) not in AUGMENTED or not isinstance(node.target,ast.Name):
                raise ValueError('Automatic match tracing supports augmented assignment to a name only')
            name=INPLACE_NAMES[AUGMENTED[type(node.op)]];used.add(name)
            return ast.copy_location(ast.Assign(targets=[node.target],value=ast.Call(func=ast.Name(id=name,ctx=ast.Load()),args=[ast.Name(id=node.target.id,ctx=ast.Load()),self.visit(node.value)],keywords=[])),node)
        def visit_Assign(self,node):
            # x[index] = value (one subscript target): operator.setitem has no result and no users, so
            # the matcher's backward search from the returned values never reaches it (nor any argument
            # only it reads: KeyError in_0, coverage family 170). Bind it to a fresh name; it is then a
            # kept in-place statement whose (None) result the pattern returns, like an unused in-place call.
            if len(node.targets)!=1 or not isinstance(node.targets[0],ast.Subscript):return node
            target=node.targets[0]
            if not isinstance(target.value,ast.Name):raise ValueError('Slice assignment to a named tensor required')
            name=f'kiln_setitem_{len(writes)}';writes.append(name);used.add(SETITEM)
            index=target.slice
            return ast.copy_location(ast.Assign(targets=[ast.Name(id=name,ctx=ast.Store())],value=ast.Call(func=ast.Name(id=SETITEM,ctx=ast.Load()),args=[ast.Name(id=target.value.id,ctx=ast.Load()),index,node.value],keywords=[])),node)
    writes=[]
    function=PreserveInPlace().visit(function)
    unused=drop_dead_statements(function)
    if unused:
        # return kept in-place results too, after the source's own returns (Decision 7.7 of KILN-009)
        returned=returns[0].value
        elements=list(returned.elts) if isinstance(returned,ast.Tuple) else [returned]
        returns[0].value=ast.Tuple(elts=elements+[ast.Name(id=name,ctx=ast.Load()) for name in unused],ctx=ast.Load())
        singleton=False
    imports=[ast.ImportFrom(module='operator',names=[ast.alias(name=n.removeprefix('kiln_'),asname=n) for n in sorted(used|{'kiln_iadd'})],level=0)]+[copy.deepcopy(n) for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom))]
    module=ast.fix_missing_locations(ast.Module(body=imports+[function],type_ignores=[]))
    text=ast.unparse(module)+'\n';namespace={};exec(compile(module,'<trusted-passnet-pattern>','exec'),namespace)
    traced=trace_pattern(namespace['pattern']);normalize_arguments(traced)
    nodes=list(traced.graph.nodes);placeholders=[n for n in nodes if n.op=='placeholder'];used=[]
    def observe(value):
        if value in placeholders and value not in used:used.append(value)
        return value
    for node in nodes:
        if node.op!='placeholder':
            torch.fx.node.map_arg(node.args,observe)
            for _,value in sorted(node.kwargs.items()):torch.fx.node.map_arg(value,observe)
    # Arguments without a live use are not part of the computation: they are neither
    # matched nor passed to the replacement (order selects the live source arguments).
    order=[placeholders.index(node) for node in used]
    args.args=[args.args[index] for index in order]
    text=ast.unparse(module)+'\n'
    nodes=used+[node for node in nodes if node.op!='placeholder']
    indexes={node:i for i,node in enumerate(nodes)}
    def freeze(value):
        if isinstance(value,torch.fx.Node):return {'node':indexes[value]}
        if isinstance(value,(tuple,list)):return {type(value).__name__:[freeze(v) for v in value]}
        if isinstance(value,dict):return {key:freeze(v) for key,v in sorted(value.items())}
        if isinstance(value,bool):return {'bool':value}
        if isinstance(value,(int,float)):return float(value)
        if value is None or isinstance(value,str):return value
        return str(value)
    output=nodes[-1]
    if output.op!='output':raise ValueError('Traced pattern must end in its output node')
    returned=output.args[0]
    returns=[indexes[n] for n in (returned if isinstance(returned,(tuple,list)) else [returned])]
    key=[{'op':node.op,'target':str(node.target) if node.op!='call_function' else getattr(node.target,'__module__','')+'.'+getattr(node.target,'__name__',str(node.target)),
          'args':freeze(node.args),'kwargs':freeze(node.kwargs)} for node in nodes[:-1]]
    # Placeholder spelling does not affect argument identity.
    for row in key:
        if row['op']=='placeholder':row['target']='argument'
    # Output order is not identity (see module docstring); the returned multiset is.
    # The traced pattern always returns a bare value or a flat tuple (singletons are
    # unwrapped above), so the source container is not part of identity either.
    identity={'body':key,'returns':sorted(returns)}
    return Pattern(text,[arg.arg for arg in args.args],singleton,json.dumps(identity,sort_keys=True),order,returns)


def output_permutation(rule_returns,variant_returns):
    """For each rule return position, the variant return position of the same node.
    A node returned twice is assigned to distinct positions in order."""
    unused=list(range(len(variant_returns)));result=[]
    for node in rule_returns:
        position=next((i for i in unused if variant_returns[i]==node),None)
        if position is None:raise ValueError('Rule and variant return different values')
        unused.remove(position);result.append(position)
    if unused:raise ValueError('Rule and variant return different values')
    return result


def reorder_outputs(structure,permutation):
    """Return structure in the matched rule's convention: a bare value for one
    output, else a flat tuple in the rule's return order. The replacement must
    return what the rule's traced pattern returns, not the source container."""
    kind,children=next(iter(structure.items()))
    children=children if kind in ('tuple','list') else [structure]
    if sorted(permutation)!=list(range(len(children))):raise ValueError('Output permutation must cover every returned value')
    ordered=[children[index] for index in permutation]
    return ordered[0] if len(ordered)==1 else {'tuple':ordered}


def generate(directory,upstream,output,runtime_directory):
    manifest=read_manifest(directory)
    if 'membership_sha256' in manifest:raise ValueError('Do not mutate a frozen policy-study corpus')
    if output.exists() or any('specialization' in r for r in manifest['variants']):raise ValueError('Preserve existing generated passes/specializations')
    patterns=[];keys={};records=[];scripts={}
    for record in manifest['variants']:
        source=(upstream/record['graph']/'model.py').read_text()
        pattern=extract_pattern(source,len(record['inputs']))
        if pattern.key not in keys:
            keys[pattern.key]=len(patterns);patterns.append(pattern)
        identity=keys[pattern.key];rule=patterns[identity]
        permutation=output_permutation(rule.returns,pattern.returns)
        canonical=translate_graph(upstream,record['graph'],'fake',input_order=pattern.order)
        scripts[record['script']]=canonical['script']
        record.update(inputs=canonical['inputs'],input_dtypes=canonical['input_dtypes'],output_structure=reorder_outputs(canonical['output_structure'],permutation),input_mutations=canonical['input_mutations'],reference_constraints=canonical['reference_constraints'],reference_domain_diagnostic=canonical.get('reference_domain_diagnostic'),
                      source_input_order=pattern.order,source_arity=len(record['inputs']),source_sha256=hashlib.sha256(canonical['script'].encode()).hexdigest(),output_permutation=permutation)
        record['specialization']=[identity]
        records.append({'graph':record['graph'],'pattern':identity,'output_permutation':permutation,'source_input_order':pattern.order,'source_model_sha256':hashlib.sha256(source.encode()).hexdigest()})
    output.mkdir(parents=True)
    for name,text in scripts.items():(directory/name).write_text(text)
    runtime='from dispatch import CorpusDispatch\nDISPATCH=CorpusDispatch('+repr(str(runtime_directory))+",include_paths=['/usr/local/cuda/include'])"+'''\ndef kiln_generated(*args):
 inputs,identity=args[:-1],args[-1]
 return DISPATCH(*inputs,specialization=(identity,))
'''
    (output/'_kiln_generated_runtime.py').write_text(runtime)
    names=[]
    for identity,pattern in enumerate(patterns):
        name=f'KilnPattern{identity:04d}';names.append(name);args=', '.join(pattern.args)
        text=pattern.text+'from _kiln_generated_runtime import kiln_generated\n'
        text+=f'def replacement_args({args}):\n return ({args}, {identity})\ndef replacement_func():\n return kiln_generated\n'
        (output/(name+'.py')).write_text(text)
    # Concrete literal patterns must run before a more general pattern whose
    # placeholders could capture those literals (for example residual + 0).
    names=sorted(names,key=lambda name:len(patterns[int(name.removeprefix('KilnPattern'))].args))
    (output/'sorted_output_pass_rule_names.json').write_text(json.dumps(names)+'\n')
    (output/'pattern-provenance.json').write_text(json.dumps({'format':'kiln-source-patterns/1','method':'Pattern AST extracted from trusted dataset GraphModule.forward; normalized FX keys (computation modulo output order) deduplicate equivalent signatures; per-variant output_permutation maps rule outputs to source outputs; generated callable invokes compiled Kiln only','records':records},indent=2)+'\n')
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(len(records),'variants;',len(patterns),'source-derived patterns')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ['directory','upstream','output','runtime-directory']:p.add_argument('--'+key,type=Path,required=True)
    a=p.parse_args();generate(a.directory,a.upstream,a.output,a.runtime_directory)


if __name__=='__main__':main()
