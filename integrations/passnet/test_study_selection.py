import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from prepare_study import classify, prepare


class StudySelectionTests(unittest.TestCase):
    def spec(self):
        return {'format':'kiln-rich-study-selection/1','salt':'test-study','sample_list':'train.txt','evaluation_list':'eval.txt',
                'excluded_manifests':['prior.json'],'train_per_category':1,'heldout_per_category':1,'max_tasks':32,'max_graphs_per_task':8,
                'max_input_elements':10000,'max_tensor_elements':10000,'max_total_tensor_elements':100000,'max_tensor_nodes':128,
                'max_matrix_products':100000,'contraction':'separate'}

    def test_contraction_resource_bound_is_shape_based(self):
        value={'input_dtypes':{'v0':'f32'},'inputs':{'v0':[7,13]},'tensor_nodes':{'a':{'shape':[7,13]},'b':{'shape':[7,11]}},
               'tensor_variables':{'v0':{'shape':[7,13]},'v2':{'shape':[7,11]}},
               'script':'const v2 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32");'}
        features,reason=classify(value,self.spec())
        self.assertIsNone(reason);self.assertEqual(features['matrix_products'],7*13*11)
        self.assertEqual(classify(value,{**self.spec(),'max_matrix_products':1000})[1],'matrix_work_excluded')

    def test_models_and_splits_are_exclusive_without_timing_feedback(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);upstream=root/'upstream';upstream.mkdir();tasks=[];graphs=[]
            for index in range(8):
                model=['observed-eval','observed-prior','matrix-a','matrix-b','matrix-c','reduction-a','reduction-b','reduction-c'][index]
                matrix=index<5;width=index+3
                graph=f'graphs/float32/samples/suite/{model}/graph0';directory=upstream/graph;directory.mkdir(parents=True)
                args='x,w' if matrix else 'x';expression='torch.matmul(x,w)' if matrix else 'x.sum(dim=-1)'
                (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,'+args+'):\n  return '+expression+'\n')
                (directory/'input_meta.py').write_text(f'class Input:\n name="in_0"\n shape=[2,{width}]\n dtype="torch.float32"\n')
                (directory/'weight_meta.py').write_text(f'class Weight:\n name="in_1"\n shape=[{width},4]\n dtype="torch.float32"\n' if matrix else '')
                task=f'samples/train/task-{index}';listing=upstream/task;listing.mkdir(parents=True);(listing/'graph_list.txt').write_text(graph+'\n')
                tasks.append(task);graphs.append(graph)
            (upstream/'train.txt').write_text('\n'.join(tasks)+'\n')
            (upstream/'eval.txt').write_text(tasks[0]+'\n')
            (root/'prior.json').write_text(json.dumps({'variants':[{'graph':graphs[1],'source_sha256':'prior'}]}))
            config=root/'spec.json';config.write_text(json.dumps(self.spec()))
            with contextlib.redirect_stdout(io.StringIO()):prepare(upstream,root/'first',config)
            first=json.loads((root/'first/manifest.json').read_text());rows=first['variants']
            self.assertEqual(len(rows),4);self.assertEqual(len({r['model'] for r in rows}),4)
            self.assertFalse(any(r['graph'] in graphs[:2] for r in rows))
            for split in ['train','heldout']:
                self.assertEqual(sorted(r['category'] for r in rows if r['split']==split),['matrix','reduction'])
            # No timing file is an input to selection; changing one cannot change membership.
            (root/'timings.json').write_text('{"heldout":"arbitrary conflicting feedback"}')
            with contextlib.redirect_stdout(io.StringIO()):prepare(upstream,root/'second',config)
            second=json.loads((root/'second/manifest.json').read_text())
            self.assertEqual(first['membership_sha256'],second['membership_sha256'])
            # A fixed compiler change can be confirmed without creating a
            # fictitious training phase or using a training selection receipt.
            confirmation=root/'confirmation-spec.json'
            confirmation.write_text(json.dumps({**self.spec(),'train_per_category':0,'heldout_per_category':2}))
            with contextlib.redirect_stdout(io.StringIO()):prepare(upstream,root/'confirmation',confirmation)
            confirmed=json.loads((root/'confirmation/manifest.json').read_text())['variants']
            self.assertEqual(len(confirmed),4)
            self.assertEqual({r['split'] for r in confirmed},{'heldout'})
            self.assertEqual(len({r['model'] for r in confirmed}),4)
            with self.assertRaisesRegex(ValueError,'Preserve'):prepare(upstream,root/'first',config)
            short=root/'short.json';short.write_text(json.dumps({**self.spec(),'max_tasks':1}))
            with contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(ValueError,'incomplete'):prepare(upstream,root/'partial',short)
            self.assertEqual(json.loads((root/'partial/scan-audit.json').read_text())['tasks_scanned'],1)
