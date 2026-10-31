import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
import torch
from corpus import FORMAT
from dispatch import CorpusDispatch,freeze_constants,restore_outputs


class DispatchTests(unittest.TestCase):
    def test_nested_outputs_and_typed_constants(self):
        structure={'tuple':[{'output':'a'},{'dict':{'z':{'list':[{'output':'b'}]}}}]}
        self.assertEqual(restore_outputs(structure,{'a':1,'b':2},()),(1,{'z':[2]}))
        self.assertNotEqual(freeze_constants([True]),freeze_constants([1]))
        with self.assertRaises(ValueError): freeze_constants([float('nan')])

    def test_conflicting_programs_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);records=[]
            for i in range(2):
                (root/f'{i}.kiln.js').write_text(str(i))
                records.append({'graph':f'graphs/{i}','script':f'{i}.kiln.js','inputs':{'x':[2]},'input_dtypes':{'x':'f32'},'output_structure':{'output':'out'},'input_mutations':[]})
            (root/'manifest.json').write_text(json.dumps({'format':FORMAT,'variants':records}))
            factory=Mock()
            with self.assertRaisesRegex(ValueError,'Conflicting'):
                CorpusDispatch(root,program_factory=factory)
            factory.assert_not_called()

    def test_unknown_specialization_never_falls_back(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);(root/'0.kiln.js').write_text('program')
            record={'graph':'graphs/0','script':'0.kiln.js','inputs':{'x':[2]},'input_dtypes':{'x':'f32'},'specialization':[3],'output_structure':{'output':'out'},'input_mutations':[]}
            (root/'manifest.json').write_text(json.dumps({'format':FORMAT,'variants':[record]}))
            program=Mock(return_value={'out':42})
            dispatcher=CorpusDispatch(root,program_factory=Mock(return_value=program))
            self.assertEqual(dispatcher(torch.zeros(2),specialization=(3,)),42)
            with self.assertRaisesRegex(ValueError,'No compiled'):
                dispatcher(torch.zeros(2),specialization=(4,))
            self.assertEqual(program.call_count,1)
            dispatcher.close();program.close.assert_called_once()

    def test_mutated_input_storage_and_return_alias(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path);(root/'0.kiln.js').write_text('program')
            record={'graph':'graphs/0','script':'0.kiln.js','inputs':{'x':[2]},
                    'input_dtypes':{'x':'f32'},'output_structure':{'input_alias':0},
                    'input_mutations':[{'input_index':0,'output':'__mut0'}]}
            (root/'manifest.json').write_text(json.dumps({'format':FORMAT,'variants':[record]}))
            program=Mock(side_effect=lambda x:{'__mut0':x+1})
            dispatcher=CorpusDispatch(root,program_factory=Mock(return_value=program))
            x=torch.tensor([2.,3.])
            result=dispatcher(x)
            self.assertIs(result,x)
            torch.testing.assert_close(x,torch.tensor([3.,4.]))
            dispatcher.close()
