import unittest
import torch
from generate_pass import extract_pattern


class PatternExtractionTests(unittest.TestCase):
    def source(self,body):return 'import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x):\n  '+body+'\n'
    def test_singleton_unwrap_and_default_equivalence(self):
        a=extract_pattern(self.source('v=torch.nn.functional.dropout(x,0.,False,False)\n  return (v,)'),1)
        b=extract_pattern(self.source('v=torch.nn.functional.dropout(x,p=0,training=False)\n  return (v,)'),1)
        self.assertTrue(a.singleton);self.assertEqual(a.key,b.key);self.assertIn('return v',a.text)
    def test_literal_specializations_remain_distinct(self):
        a=extract_pattern(self.source('v=x*2\n  return (v,)'),1)
        b=extract_pattern(self.source('v=x*3\n  return (v,)'),1)
        self.assertNotEqual(a.key,b.key)
    def test_stateful_and_nested_outputs_rejected(self):
        for body in ['v=self.weight*x\n  return (v,)','v=x+x\n  return ((v,x),)']:
            with self.assertRaises(ValueError):extract_pattern(self.source(body),1)

    def test_inplace_add_identity_preserved(self):
        pattern=extract_pattern(self.source('v=x+x\n  v+=x\n  return (v,)'),1)
        self.assertIn('kiln_iadd',pattern.text);self.assertIn('_operator.iadd',pattern.key)

    def test_other_inplace_operators_and_factories_preserved(self):
        pattern=extract_pattern(self.source("v=x.sum(-1)\n  x/=v\n  m=torch.ones((2,3),device='cuda')\n  m*=-1.0\n  return (x,m)"),1)
        self.assertIn('kiln_itruediv',pattern.text);self.assertIn('kiln_imul',pattern.text)
        self.assertIn('_operator.itruediv',pattern.key);self.assertIn('torch.ones',pattern.key)

    def test_inplace_write_through_a_view_kept(self):
        pattern=extract_pattern(self.source("m=torch.zeros((1,4,4))\n  v=m[(slice(None),slice(-1,None),slice(None))]\n  w=v.fill_(1)\n  v=w=None\n  r=m.reshape(1,16)\n  y=r+x\n  return (y,)"),1)
        self.assertIn('fill_',pattern.text);self.assertEqual(len(pattern.returns),2)

    def test_output_order_and_container_are_not_identity(self):
        two='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x,y):\n  u=x+y\n  v=x*y\n  return '
        ab=extract_pattern(two+'(u, v)\n',2);ba=extract_pattern(two+'(v, u)\n',2)
        self.assertEqual(ab.key,ba.key);self.assertEqual(ab.returns,list(reversed(ba.returns)))
        self.assertEqual(extract_pattern(self.source('v=x*2\n  return (v,)'),1).key,extract_pattern(self.source('v=x*2\n  return v'),1).key)

    def test_dead_source_code_is_not_part_of_the_pattern(self):
        source='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x,y,z):\n  u=x+y;  x = y = None\n  dead=torch.relu(z);  z = dead = None\n  return (u,)\n'
        pattern=extract_pattern(source,3)
        self.assertEqual(pattern.args,['x','y']);self.assertEqual(pattern.order,[0,1])
        self.assertNotIn('relu',pattern.text);self.assertNotIn('None',pattern.text)
        self.assertEqual(pattern.key,extract_pattern(self.source('u=x+x\n  return (u,)').replace('x+x','x+y').replace('forward(self,x)','forward(self,x,y)'),2).key)
        effect='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x,y):\n  u=x+y\n  y+=x\n  return (u,)\n'
        # an in-place update of an argument is observable: kept although its result is unused
        self.assertIn('kiln_iadd(y',extract_pattern(effect,2).text)
        unread='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x,y):\n  u=x+y\n  w=x*2\n  w+=x\n  return (u,)\n'
        self.assertNotIn('kiln_iadd(w',extract_pattern(unread,2).text)

    def test_dead_source_code_and_arguments_leave_the_program(self):
        import tempfile
        from pathlib import Path
        from corpus import translate_graph
        with tempfile.TemporaryDirectory() as temporary:
            graph=Path(temporary)/'g';graph.mkdir()
            (graph/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,in_0,in_1,in_2):\n  u=in_0*in_2\n  dead=torch.relu(in_1)\n  return (u,)\n')
            (graph/'input_meta.py').write_text('\n'.join(f'class Meta{i}:\n name="in_{i}"\n shape=[2,3]\n dtype="torch.float32"\n' for i in range(3)))
            (graph/'weight_meta.py').write_text('')
            result=translate_graph(Path(temporary),'g','fake',input_order=[0,2])
            self.assertEqual(list(result['inputs']),['v0','v1']);self.assertNotIn('relu',result['script'])
            with self.assertRaisesRegex(ValueError,'omits a live'):translate_graph(Path(temporary),'g','fake',input_order=[0])

    # KILN-009 family 162: an unused in-place result on a live intermediate, and x.__eq__(0) spelled by name
    FAMILY_162='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,in_0,in_1):\n  tmp_1 = in_1.cumsum(-1)\n  tmp_2 = tmp_1 - 1\n  tmp_3 = in_0.__eq__(0)\n  tmp_4 = tmp_2.masked_fill_(tmp_3, 1);  tmp_3 = tmp_4 = None\n  tmp_5 = tmp_2 * 2\n  return (tmp_5,)\n'

    def test_unused_inplace_result_is_returned_and_matches(self):
        import ast,copy
        from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
        from generate_pass import drop_dead_statements
        from fx_normalize import trace_pattern,normalize_arguments
        function=copy.deepcopy(ast.parse(self.FAMILY_162).body[1].body[0])
        self.assertEqual(drop_dead_statements(function),['tmp_4'])
        pattern=extract_pattern(self.FAMILY_162,2)
        self.assertIn('return (tmp_5, tmp_4)',pattern.text);self.assertFalse(pattern.singleton);self.assertEqual(len(pattern.returns),2)
        namespace={};exec(compile(pattern.text,'<pattern>','exec'),namespace)
        traced=trace_pattern(namespace['pattern']);normalize_arguments(traced)
        matcher=SubgraphMatcher(traced.graph,match_output=False,match_placeholder=False,remove_overlapping_matches=True,ignore_literals=False)
        # the target as TorchDynamo records it: call_method __eq__, and masked_fill_ without users
        namespace={};exec(compile(self.FAMILY_162,'<model>','exec'),namespace)
        graphs=[]
        torch._dynamo.reset()
        torch.compile(namespace['GraphModule'](),backend=lambda gm,example:(graphs.append(gm),gm.forward)[1],dynamic=False,fullgraph=True)(torch.zeros(2,5,dtype=torch.int64),torch.ones(2,5,dtype=torch.int64))
        target=graphs[0]
        self.assertTrue(any(n.op=='call_method' and n.target=='__eq__' for n in target.graph.nodes))
        changed=normalize_arguments(target)
        self.assertIn('call_method:__eq__',[c.get('spelling') for c in changed])
        matches=matcher.match(target.graph)
        self.assertEqual(len(matches),1);self.assertEqual(len(matches[0].returning_nodes),2)

    def test_unused_inplace_result_is_a_program_output(self):
        import tempfile
        from pathlib import Path
        from corpus import translate_graph
        with tempfile.TemporaryDirectory() as temporary:
            graph=Path(temporary)/'g';graph.mkdir()
            (graph/'model.py').write_text(self.FAMILY_162)
            (graph/'input_meta.py').write_text('\n'.join(f'class Meta{i}:\n name="in_{i}"\n shape=[2,5]\n dtype="torch.int64"\n' for i in range(2)))
            (graph/'weight_meta.py').write_text('')
            result=translate_graph(Path(temporary),'g','fake')
            kind,leaves=next(iter(result['output_structure'].items()))
            self.assertEqual(kind,'tuple');self.assertEqual(len(leaves),len(extract_pattern(self.FAMILY_162,2).returns))
            self.assertEqual(result['input_mutations'],[])

    # coverage family 170 (OPT causal mask): a slice assignment whose value is the only path from an argument
    # (in_0) to the write; the write itself has no users. Before kiln-pattern-autowrap/3 the matcher's backward
    # search from the returned value never reached in_0 (KeyError: in_0 in SubgraphMatcher.match).
    FAMILY_170=('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,in_0):\n'
                '  tmp_1 = torch.full((4, 4), fill_value = -1.0, dtype = torch.float32)\n'
                '  tmp_2 = tmp_1[(None, None, slice(None, None, None), slice(None, None, None))]\n'
                '  tmp_3 = tmp_2.clone();  tmp_2 = None\n'
                '  tmp_4 = in_0[(slice(None, None, None), None, None, slice(None, None, None))];  in_0 = None\n'
                '  tmp_5 = tmp_3[(slice(None, None, None), slice(None, None, None), slice(None, None, None), slice(None, 4, None))]\n'
                '  tmp_6 = tmp_5.masked_fill(tmp_4 == 0, -2.0);  tmp_5 = None\n'
                '  tmp_3[(slice(None, None, None), slice(None, None, None), slice(None, None, None), slice(None, 4, None))] = tmp_6;  setitem = tmp_3;  tmp_6 = setitem = None\n'
                '  tmp_7 = tmp_3.mul(2.0);  tmp_3 = None\n'
                '  return (tmp_7,)\n')

    def test_slice_assignment_is_returned_and_matches(self):
        from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
        from fx_normalize import trace_pattern,normalize_arguments
        pattern=extract_pattern(self.FAMILY_170,1)
        self.assertIn('kiln_setitem_0 = kiln_setitem(tmp_3, ',pattern.text);self.assertIn('return (tmp_7, kiln_setitem_0)',pattern.text)
        self.assertIn('from operator import iadd as kiln_iadd, setitem as kiln_setitem',pattern.text)
        self.assertEqual(pattern.args,['in_0']);self.assertEqual(len(pattern.returns),2);self.assertIn('_operator.setitem',pattern.key)
        namespace={};exec(compile(pattern.text,'<pattern>','exec'),namespace)
        traced=trace_pattern(namespace['pattern']);normalize_arguments(traced)
        matcher=SubgraphMatcher(traced.graph,match_output=False,match_placeholder=False,remove_overlapping_matches=True,ignore_literals=False)
        namespace={};exec(compile(self.FAMILY_170,'<model>','exec'),namespace);graphs=[]
        torch._dynamo.reset()
        torch.compile(namespace['GraphModule'](),backend=lambda gm,example:(graphs.append(gm),gm.forward)[1],dynamic=False,fullgraph=True)(torch.zeros(1,4,dtype=torch.int64))
        target=graphs[0];normalize_arguments(target)
        self.assertTrue(any(n.target is __import__('operator').setitem and not n.users for n in target.graph.nodes))
        matches=matcher.match(target.graph)
        self.assertEqual(len(matches),1);self.assertEqual(len(matches[0].returning_nodes),2)
        self.assertEqual(len(matches[0].placeholder_nodes),1)

    def test_slice_assignment_is_a_valueless_program_output(self):
        import tempfile
        from pathlib import Path
        from corpus import translate_graph
        from dispatch import count_outputs,restore_outputs
        with tempfile.TemporaryDirectory() as temporary:
            graph=Path(temporary)/'g';graph.mkdir()
            (graph/'model.py').write_text(self.FAMILY_170)
            (graph/'input_meta.py').write_text('class Meta0:\n name="in_0"\n shape=[1,4]\n dtype="torch.int64"\n')
            (graph/'weight_meta.py').write_text('')
            result=translate_graph(Path(temporary),'g','fake')
            self.assertEqual(result['output_structure'],{'tuple':[{'output':'out0'},{'none':True}]})
            self.assertEqual(count_outputs(result['output_structure']),1)
            self.assertEqual(restore_outputs(result['output_structure'],{'out0':'value'},()),('value',None))

    def test_rebound_unused_inplace_result_is_refused(self):
        source='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x):\n  t = x * 2\n  r = t.relu_()\n  r = t + 1\n  return (r,)\n'
        with self.assertRaisesRegex(ValueError,'rebound later'):extract_pattern(source,1)

    def test_output_permutation_assigns_duplicate_returns(self):
        from generate_pass import output_permutation,reorder_outputs
        self.assertEqual(output_permutation([4,4,5],[5,4,4]),[1,2,0])
        with self.assertRaises(ValueError):output_permutation([4,5],[4,6])
        self.assertEqual(reorder_outputs({'tuple':[{'output':'out0'},{'input_alias':0}]},[1,0]),{'tuple':[{'input_alias':0},{'output':'out0'}]})
        self.assertEqual(reorder_outputs({'tuple':[{'output':'out0'}]},[0]),{'output':'out0'})
        self.assertEqual(reorder_outputs({'output':'out0'},[0]),{'output':'out0'})

    def test_permuted_variants_share_one_rule_and_return_rule_order(self):
        import json,tempfile
        from pathlib import Path
        from generate_pass import generate
        from dispatch import CorpusDispatch
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);corpus=root/'corpus';corpus.mkdir();upstream=root/'upstream';records=[]
            for name,returns,shape in [('ab','(u, v)',[2,3]),('ba','(v, u)',[4,5]),('single','(u,)',[6,7]),('bare','u',[8,9])]:
                directory=upstream/name;directory.mkdir(parents=True)
                body='  u=x+y\n'+('  v=x*y\n' if 'v' in returns else '')
                (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x,y):\n'+body+'  return '+returns+'\n')
                (directory/'input_meta.py').write_text('\n'.join(f'class Meta{i}:\n name="in_{i}"\n shape={shape}\n dtype="torch.float32"\n' for i in range(2)))
                (directory/'weight_meta.py').write_text('')
                records.append({'graph':name,'script':name+'.kiln.js','inputs':{f'v{i}':shape for i in range(2)},'input_dtypes':{f'v{i}':'f32' for i in range(2)}})
            (corpus/'manifest.json').write_text(json.dumps({'format':'kiln-passnet-corpus/1','variants':records}))
            generate(corpus,upstream,root/'passes',Path('/work/corpus'))
            rows=json.loads((corpus/'manifest.json').read_text())['variants']
            self.assertEqual([r['specialization'] for r in rows],[[0],[0],[1],[1]])
            self.assertEqual([r['output_permutation'] for r in rows],[[0,1],[1,0],[0],[0]])
            self.assertEqual(sorted(p.name for p in (root/'passes').glob('KilnPattern*.py')),['KilnPattern0000.py','KilnPattern0001.py'])
            def own_order(name,x,y):
                u,v=x+y,x*y
                return {'ab':{'out0':u,'out1':v},'ba':{'out0':v,'out1':u}}.get(name,{'out0':u})
            class Program:
                def __init__(self,artifact,**kw):self.name=Path(artifact).name.split('.')[0]
                def __call__(self,x,y):return own_order(self.name,x,y)
                def close(self):pass
            dispatch=CorpusDispatch(corpus,program_factory=Program)
            for row in rows:
                shape=row['inputs']['v0'];x=torch.rand(shape);y=torch.rand(shape)
                result=dispatch(x,y,specialization=row['specialization'])
                if row['specialization']==[0]:
                    torch.testing.assert_close(result[0],x+y);torch.testing.assert_close(result[1],x*y)
                else:
                    self.assertIsInstance(result,torch.Tensor);torch.testing.assert_close(result,x+y)

    def test_specializations_disambiguate_equal_metadata(self):
        import json,tempfile
        from pathlib import Path
        from generate_pass import generate
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);corpus=root/'corpus';corpus.mkdir();upstream=root/'upstream';records=[]
            for i in [2,3]:
                directory=upstream/str(i);directory.mkdir(parents=True)
                (directory/'model.py').write_text(self.source(f'v=x*{i}\n  return (v,)'))
                (directory/'input_meta.py').write_text('class Meta:\n name="in_0"\n shape=[2,3]\n dtype="torch.float32"\n')
                (directory/'weight_meta.py').write_text('')
                records.append({'graph':str(i),'script':str(i)+'.kiln.js','inputs':{'v0':[2,3]},'input_dtypes':{'v0':'f32'},'output_structure':{'tuple':[{'output':'out0'}]}})
            (corpus/'manifest.json').write_text(json.dumps({'format':'kiln-passnet-corpus/1','variants':records}))
            generate(corpus,upstream,root/'passes',Path('/work/corpus'))
            manifest=json.loads((corpus/'manifest.json').read_text())
            self.assertEqual([r['specialization'] for r in manifest['variants']],[[0],[1]])
            self.assertEqual(len(json.loads((root/'passes/pattern-provenance.json').read_text())['records']),2)

    def test_canonical_roles_preserve_nonassociative_operand_order(self):
        import json,tempfile
        from pathlib import Path
        from generate_pass import generate
        from corpus import load_module,canonical_order_inputs
        from dispatch import CorpusDispatch
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);corpus=root/'corpus';corpus.mkdir();upstream=root/'upstream';records=[]
            for name,expression,outer in [('first','x+y','z'),('last','y+z','x')]:
                directory=upstream/name;directory.mkdir(parents=True)
                source='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x,y,z):\n  v='+expression+'\n  v+='+outer+'\n  return (v,)\n'
                (directory/'model.py').write_text(source)
                (directory/'input_meta.py').write_text('\n'.join(f'class Meta{i}:\n name="in_{i}"\n shape=[1,1,1,1]\n dtype="torch.float16"\n' for i in range(3)))
                (directory/'weight_meta.py').write_text('')
                records.append({'graph':name,'script':name+'.kiln.js','inputs':{f'v{i}':[1,1,1,1] for i in range(3)},'input_dtypes':{f'v{i}':'f16' for i in range(3)}})
            (corpus/'manifest.json').write_text(json.dumps({'format':'kiln-passnet-corpus/1','variants':records}))
            generate(corpus,upstream,root/'passes',Path('/work/corpus'))
            rows=json.loads((corpus/'manifest.json').read_text())['variants']
            self.assertEqual([r['source_input_order'] for r in rows],[[0,1,2],[1,2,0]])
            self.assertEqual([r['specialization'] for r in rows],[[0],[0]])
            self.assertEqual((corpus/'first.kiln.js').read_text(),(corpus/'last.kiln.js').read_text())
            class Program:
                def __init__(self,*a,**kw):pass
                def __call__(self,a,b,c):return {'out0':(a+b)+c}
                def close(self):pass
            dispatch=CorpusDispatch(corpus,program_factory=Program)
            inputs=[torch.full((1,1,1,1),v,dtype=torch.float16) for v in [2048,-2048,.5]]
            for row in rows:
                expected=load_module(upstream/row['graph']/'model.py').GraphModule()(*inputs)[0]
                canonical=canonical_order_inputs(row,inputs)
                self.assertEqual(len(canonical),len(inputs))
                # one-output rules return the bare tensor, as their traced pattern does
                actual=dispatch(*canonical,specialization=row['specialization'])
                torch.testing.assert_close(actual,expected,rtol=0,atol=0)

    def test_literal_patterns_precede_general_tensor_placeholders(self):
        import ast,json,tempfile
        from pathlib import Path
        from generate_pass import generate
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);corpus=root/'corpus';corpus.mkdir();upstream=root/'upstream';rows=[]
            for arity in [3,2,1]:
                args=['x','y','z'][:arity];first='x+y' if arity>1 else 'x+0';last='z' if arity==3 else '0'
                directory=upstream/str(arity);directory.mkdir(parents=True)
                (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,'+','.join(args)+'):\n  v='+first+'\n  v+='+last+'\n  return (v,)\n')
                (directory/'input_meta.py').write_text('\n'.join(f'class Meta{i}:\n name="in_{i}"\n shape=[2,3]\n dtype="torch.float32"\n' for i in range(arity)))
                (directory/'weight_meta.py').write_text('')
                rows.append({'graph':str(arity),'script':str(arity)+'.kiln.js','inputs':{f'v{i}':[2,3] for i in range(arity)}})
            (corpus/'manifest.json').write_text(json.dumps({'format':'kiln-passnet-corpus/1','variants':rows}))
            generate(corpus,upstream,root/'passes',Path('/work/corpus'))
            names=json.loads((root/'passes/sorted_output_pass_rule_names.json').read_text())
            arities=[]
            for name in names:
                tree=ast.parse((root/'passes'/(name+'.py')).read_text())
                arities.append(len(next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='pattern').args.args))
            self.assertEqual(arities,[1,2,3])
