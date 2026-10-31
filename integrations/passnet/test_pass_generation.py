import unittest
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
        text,_,_,key=extract_pattern(self.source('v=x+x\n  v+=x\n  return (v,)'),1)
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
                records.append({'graph':str(i),'script':str(i)+'.kiln.js','inputs':{'v0':[2,3]},'input_dtypes':{'v0':'f32'},'output_structure':{'tuple':[{'output':'out0'}]}})
            (corpus/'manifest.json').write_text(json.dumps({'format':'kiln-passnet-corpus/1','variants':records}))
            generate(corpus,upstream,root/'passes',Path('/work/corpus'))
            manifest=json.loads((corpus/'manifest.json').read_text())
            self.assertEqual([r['specialization'] for r in manifest['variants']],[[0],[1]])
            self.assertEqual(len(json.loads((root/'passes/pattern-provenance.json').read_text())['records']),2)
