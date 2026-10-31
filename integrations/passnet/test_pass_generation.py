import unittest
import torch
from generate_pass import extract_pattern


class PatternExtractionTests(unittest.TestCase):
    def source(self,body):return 'import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x):\n  '+body+'\n'
    def test_singleton_unwrap_and_default_equivalence(self):
        a=extract_pattern(self.source('v=torch.nn.functional.dropout(x,0.,False,False)\n  return (v,)'),1)
        b=extract_pattern(self.source('v=torch.nn.functional.dropout(x,p=0,training=False)\n  return (v,)'),1)
        self.assertTrue(a[2]);self.assertEqual(a[3],b[3]);self.assertIn('return v',a[0])
    def test_literal_specializations_remain_distinct(self):
        a=extract_pattern(self.source('v=x*2\n  return (v,)'),1)
        b=extract_pattern(self.source('v=x*3\n  return (v,)'),1)
        self.assertNotEqual(a[3],b[3])
    def test_stateful_and_nested_outputs_rejected(self):
        for body in ['v=self.weight*x\n  return (v,)','v=x+x\n  return ((v,x),)']:
            with self.assertRaises(ValueError):extract_pattern(self.source(body),1)

    def test_inplace_add_identity_preserved(self):
        text,_,_,key,_=extract_pattern(self.source('v=x+x\n  v+=x\n  return (v,)'),1)
        self.assertIn('kiln_iadd',text);self.assertIn('_operator.iadd',key)

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
        from corpus import load_module,canonical_order_inputs,source_order_inputs
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
                self.assertTrue(all(a is b for a,b in zip(source_order_inputs(row,canonical),inputs)))
                actual=dispatch(*canonical,specialization=row['specialization'])[0]
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
