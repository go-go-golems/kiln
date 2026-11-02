import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from native_policy_task import training_view
from policy_search import (baseline_programs, collect_searches, confirmation_policies,
                           digest, freeze_searches, run_baseline, select_searches,
                           summarize_searches, validate_protocol)
from summarize_policy import summarize


class SearchLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.manifest={'membership_sha256':'a'*64,'numerical_policy':{'contraction':'separate'},
                       'scope':'Test fixture','variants':[{'graph':'train','split':'train'},
                                                        {'graph':'secret','split':'heldout'}]}
        self.receipt={'membership_sha256':'a'*64,'phase':'train','numerical_policy':{'contraction':'separate'},
                      'records':[{'graph':'train','split':'train','status':'compiled','decisions':[
                          {'originalWork':100,'fusedWork':110,'consumerCount':2,'producerElements':16}]}]}
        self.protocol={'format':'kiln-policy-search-protocol/1','proposal_budget':2,'searches':[
            {'id':'first','method':'threshold-grid','values':[1.0,1.0]},
            {'id':'second','method':'threshold-grid','values':[1.0,1.2]}]}

    def runs(self):
        runs={s['id']:self.root/s['id'] for s in self.protocol['searches']}
        for name,path in runs.items():run_baseline(self.protocol,name,self.manifest,self.receipt,path)
        return runs

    def test_shared_artifacts_and_duplicates_keep_method_budgets(self):
        result=collect_searches(self.protocol,self.runs(),self.manifest,self.receipt)
        self.assertEqual(len(result['programs']),2)
        self.assertEqual(result['search_groups']['first'][1],result['search_groups']['second'][1])
        self.assertEqual(result['search_ledgers']['first']['used_slots'],2)
        self.assertEqual(result['search_ledgers']['first']['attempts'][1]['status'],'duplicate')
        self.assertEqual(result['search_ledgers']['first']['unique_artifacts'],1)

    def test_raw_request_tampering_rejected(self):
        runs=self.runs();path=runs['first']/'task/attempt-0001.request.json'
        data=json.loads(path.read_text());data['policy_json']='{}';path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'Raw proposal identity'):collect_searches(self.protocol,runs,self.manifest,self.receipt)

    def test_valid_artifact_substitution_rejected(self):
        runs=self.runs();path=runs['first']/'task/attempt-0001.artifact.json'
        data=json.loads(path.read_text());data['program']['max_work_growth']=1.1;path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'Accepted artifact identity'):collect_searches(self.protocol,runs,self.manifest,self.receipt)

    def test_missing_attempt_rejected(self):
        runs=self.runs();(runs['first']/'task/attempt-0002.result.json').unlink()
        with self.assertRaisesRegex(ValueError,'Incomplete or extra'):collect_searches(self.protocol,runs,self.manifest,self.receipt)

    def test_fixed_baseline_request_cannot_be_renamed(self):
        runs=self.runs();path=runs['first']/'task/attempt-0001.request.json'
        data=json.loads(path.read_text());policy=json.loads(data['policy_json']);policy['id']='other'
        data['policy_json']=json.dumps(policy);raw=data['policy_json'].encode()
        data.update(request_bytes=len(raw),request_sha256=hashlib.sha256(raw).hexdigest())
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'submitted programs differ'):collect_searches(self.protocol,runs,self.manifest,self.receipt)

    def test_random_replay_uses_only_approved_training(self):
        search={'id':'random','method':'seeded-random','seed':20261031}
        view=training_view(self.manifest,self.receipt)
        policies=baseline_programs(search,16,view)
        changed=copy.deepcopy(self.receipt)
        changed['records'].append({'graph':'secret','split':'heldout','decisions':[{'originalWork':999}]})
        self.assertEqual(policies,baseline_programs(search,16,training_view(self.manifest,changed)))
        self.assertNotEqual(policies,baseline_programs({**search,'seed':1},16,view))
        protocol={'format':'kiln-policy-search-protocol/1','proposal_budget':16,'searches':[search]}
        result=run_baseline(protocol,'random',self.manifest,self.receipt,self.root/'random')
        self.assertTrue(all(r['status'] in ['accepted','duplicate'] for r in result['results']))

    def test_budget_and_method_declarations(self):
        for mutation in [dict(proposal_budget=3),dict(searches=self.protocol['searches']*2)]:
            with self.assertRaises(ValueError):validate_protocol({**self.protocol,**mutation})

    def test_freeze_includes_raw_ledgers_and_prevents_overwrite(self):
        runs=self.runs();corpus=self.root/'corpus';(corpus/'policies').mkdir(parents=True)
        (corpus/'manifest.json').write_text(json.dumps(self.manifest))
        (corpus/'reference-domains.json').write_text('{}')
        for policy in [{'format':'kiln-fusion-policy/1','id':'baseline','kind':'unchanged'},
                       {'format':'kiln-fusion-policy/1','id':'default','kind':'threshold','max_work_growth':1.02}]:
            (corpus/'policies'/(policy['id']+'.json')).write_text(json.dumps(policy))
        wrapper=self.root/'wrapper.py';wrapper.write_text('# test wrapper\n')
        plan=freeze_searches(self.protocol,runs,corpus,self.receipt,wrapper)
        self.assertEqual(len(plan['candidate_ids']),4)
        freeze=json.loads((corpus/'candidate-freeze.json').read_text())
        self.assertIn('search-evidence/first/task/attempt-0002.request.json',freeze['files_sha256'])
        for name,sha in freeze['files_sha256'].items():self.assertEqual(hashlib.sha256((corpus/name).read_bytes()).hexdigest(),sha)
        with self.assertRaises(FileExistsError):freeze_searches(self.protocol,runs,corpus,self.receipt,wrapper)


class SearchSelectionTests(unittest.TestCase):
    def fixture(self):
        variants=[{'graph':'train','split':'train','sample':'A'},{'graph':'test','split':'heldout','sample':'B'}]
        membership=hashlib.sha256(json.dumps(variants,sort_keys=True).encode()).hexdigest()
        corpus={'membership_sha256':membership,'variants':variants}
        plan={'candidate_ids':['baseline','default','a','b','tie'], 'membership_sha256':membership,
              'search_groups':{'first':['baseline','a'],'second':['baseline','b'],'third':['baseline','tie']}}
        def record(graph,split,sample):
            return {'graph':graph,'split':split,'sample':sample,
                    'bindings':{p:p for p in plan['candidate_ids']},
                    'measurements':{p:{'status':'measured','e2e_median_ms':latency,
                                       'stream_elapsed_median_ms':latency,'output_max_abs_errors':[0],
                                       'rounds':[{'attempts':[{'e2e_ms':{'median':latency}}]}]}
                                    for p,latency in [('baseline',10),('default',10),('a',5),('b',8),('tie',10)]}}
        training={'phase':'train','status':'complete','membership_sha256':membership,'plan':plan,
                  'policies':plan['candidate_ids'],'expected_graphs':['train'],'records':[record('train','train','A')]}
        heldout={'phase':'heldout','status':'complete','membership_sha256':membership,'plan':copy.deepcopy(plan),
                 'policies':['baseline','a','b'],'records':[record('test','heldout','B')]}
        return corpus,training,heldout

    def test_independent_winners_and_tie_fallback(self):
        _,training,_=self.fixture();selection=select_searches(training)
        self.assertEqual([v['selected_policy'] for v in selection['selections'].values()],['a','b','baseline'])
        self.assertEqual(confirmation_policies(training['plan'],selection),['baseline','a','b'])

    def test_failed_candidate_does_not_remove_other_method(self):
        _,training,_=self.fixture();training['records'][0]['measurements']['a']['status']='compile_failed'
        selection=select_searches(training)
        self.assertEqual(selection['selections']['first']['selected_policy'],'baseline')
        self.assertEqual(selection['selections']['second']['selected_policy'],'b')

    def test_foreign_winner_and_changed_plan_rejected(self):
        _,training,_=self.fixture();selection=select_searches(training)
        selection['selections']['first']['selected_policy']='b'
        with self.assertRaisesRegex(ValueError,'different search'):confirmation_policies(training['plan'],selection)
        selection=select_searches(training);training['plan']['candidate_ids'].append('extra')
        with self.assertRaises(ValueError):confirmation_policies(training['plan'],selection)

    def test_summary_requires_exact_training_selection_and_complete_confirmation(self):
        corpus,training,heldout=self.fixture();selection=select_searches(training)
        summary=summarize_searches(corpus,training,selection,heldout)
        self.assertEqual(summary['methods']['first']['heldout_family_balanced_e2e_speedup'],2)
        self.assertEqual(summary['methods']['second']['heldout_family_balanced_e2e_speedup'],1.25)
        self.assertEqual(summary['methods']['third']['heldout_family_balanced_e2e_speedup'],1)
        changed=copy.deepcopy(selection);changed['selections']['first']['selected_policy']='baseline'
        with self.assertRaisesRegex(ValueError,'training-only'):summarize_searches(corpus,training,changed,heldout)
        heldout['records']=[]
        with self.assertRaisesRegex(ValueError,'Incomplete held-out'):summarize_searches(corpus,training,selection,heldout)

    def test_confirmation_failure_keeps_graph_and_has_no_conditional_speedup(self):
        corpus,training,heldout=self.fixture();selection=select_searches(training)
        heldout['records'][0]['measurements']['a']['status']='correctness_failed'
        summary=summarize_searches(corpus,training,selection,heldout)
        self.assertIsNone(summary['methods']['first']['heldout_family_balanced_e2e_speedup'])
        self.assertEqual(summary['methods']['first']['heldout_failures'],['test'])
        self.assertTrue(summary['methods']['second']['heldout_qualified'])

    def test_original_single_selection_uses_same_metrics(self):
        corpus,training,heldout=self.fixture();heldout['policies']=['baseline','a']
        single=summarize(corpus,training,{'membership_sha256':corpus['membership_sha256'],'selected_policy':'a'},heldout)
        self.assertEqual(single['heldout_family_balanced_e2e_speedup'],2)
        self.assertEqual(single['heldout_graphs'],1)


if __name__=='__main__':unittest.main()
