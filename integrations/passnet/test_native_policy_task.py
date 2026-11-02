import copy
import json
from pathlib import Path
import tempfile
import unittest

from native_policy_task import NativePolicyTask, training_view


class NativePolicyTaskTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)/'task'
        self.manifest = {'membership_sha256':'a'*64,
                         'numerical_policy':{'contraction':'separate'},
                         'variants':[{'graph':'approved-train','split':'train'},
                                     {'graph':'secret-heldout','split':'heldout'}]}
        self.receipt = {'membership_sha256':'a'*64, 'phase':'train',
                        'numerical_policy':{'contraction':'separate'},
                        'records':[{'graph':'approved-train','split':'train','status':'compiled',
                                    'script':'do-not-expose-path',
                                    'decisions':[{'originalWork':100,'fusedWork':101,
                                                  'consumerCount':1,'producerElements':16,
                                                  'private_debug':'do-not-expose'}]}]}
        self.policy = {'format':'kiln-fusion-policy/1','id':'proposal','kind':'threshold','max_work_growth':1.02}

    def task(self, budget=5, **kwargs):
        return NativePolicyTask(self.output,self.manifest,self.receipt,proposal_budget=budget,**kwargs)

    def test_training_projection_ignores_unapproved_metadata_and_heldout(self):
        expected=training_view(self.manifest,self.receipt)
        changed=copy.deepcopy(self.receipt)
        changed['records'].append({'graph':'secret-heldout','split':'heldout','status':'failed',
                                   'decisions':[{'originalWork':float('nan')}], 'secret':'not exposed'})
        self.assertEqual(training_view(self.manifest,changed),expected)
        self.assertNotIn('do-not-expose',json.dumps(expected))
        self.assertNotIn('secret-heldout',json.dumps(expected))
        self.receipt['records'][0]['split']='heldout'
        with self.assertRaisesRegex(ValueError,'training traces'):self.task()
        self.assertFalse(self.output.exists())

    def test_invalid_and_duplicate_attempts_consume_budget(self):
        task=self.task(budget=4)
        self.assertEqual(task.submit_policy('{')['status'],'rejected')
        first=task.submit_policy(json.dumps(self.policy))
        self.assertEqual(first['status'],'accepted')
        self.policy.update(id='renamed',provenance={'author':'another proposer'})
        duplicate=task.submit_policy(json.dumps(self.policy))
        self.assertEqual(duplicate['status'],'duplicate')
        self.assertEqual(duplicate['duplicate_of'],2)
        self.assertEqual(duplicate['artifact_sha256'],first['artifact_sha256'])
        self.assertEqual(task.call('submit_policy',{'policy_json':'{}','rtol':1})['status'],'rejected')
        self.assertEqual(task.submit_policy(json.dumps(self.policy))['status'],'budget_exhausted')
        self.assertEqual(len(list(self.output.glob('*.request.json'))),4)
        self.assertEqual(len(list(self.output.glob('*.artifact.json'))),1)
        self.assertEqual(task.finish(),{'status':'finished','attempts':4,'unique_artifacts':1,'evaluation_status':'not_run'})
        self.assertEqual(task.submit_policy('{}')['status'],'closed')

    def test_malformed_proposals_and_forbidden_controls(self):
        task=self.task(budget=7)
        requests=['{"id":"x","id":"y"}', '{"x":NaN}', '{"x":1e999}',
                  json.dumps({**self.policy,'numerical_policy':{'contraction':'allow'}}),
                  json.dumps({**self.policy,'max_work_growth':3}), ' '*16385, '[]']
        for request in requests:
            with self.subTest(request=request[:60]):
                self.assertEqual(task.submit_policy(request)['status'],'rejected')
        self.assertEqual(task.finish()['attempts'],7)

    def test_validator_failure_is_recorded_and_charged(self):
        task=self.task(budget=1,node='/nonexistent/kiln-test-node')
        self.assertEqual(task.submit_policy(json.dumps(self.policy))['status'],'infrastructure_error')
        self.assertEqual(task.submit_policy('{}')['status'],'budget_exhausted')
        self.assertEqual(len(list(self.output.glob('*.result.json'))),1)

    def test_non_object_submission_arguments_consume_budget(self):
        task=self.task(budget=1)
        self.assertEqual(task.call('submit_policy',[])['status'],'rejected')
        self.assertEqual(task.call('submit_policy',{})['status'],'budget_exhausted')

    def test_host_inputs_are_detached_and_existing_runs_preserved(self):
        task=self.task()
        self.manifest['numerical_policy']['contraction']='allow'
        self.receipt['records'][0]['decisions'][0]['originalWork']=999
        view=task.inspect_training()
        self.assertEqual(view['numerical_policy']['contraction'],'separate')
        view['examples'][0]['decisions'][0]['originalWork']=777
        self.assertEqual(task.inspect_training()['examples'][0]['decisions'][0]['originalWork'],100)
        self.manifest['numerical_policy']['contraction']='separate'
        with self.assertRaises(FileExistsError):self.task()
        self.assertEqual(task.call('execute_bash',{'command':'false'})['status'],'unknown_tool_or_arguments')

    def test_numeric_contract_and_phase_are_required(self):
        self.receipt['numerical_policy']['contraction']='allow'
        with self.assertRaisesRegex(ValueError,'numerical policy mismatch'):self.task()
        self.receipt['numerical_policy']['contraction']='separate'
        self.receipt['phase']='all'
        with self.assertRaisesRegex(ValueError,'training-only'):self.task()


if __name__=='__main__':unittest.main()
