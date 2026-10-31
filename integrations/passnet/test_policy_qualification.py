import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from qualify_policies import qualify,measurement_groups
from select_policy import rank_training


class QualificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.corpus=Path(self.temporary.name)/'corpus';self.artifacts=Path(self.temporary.name)/'artifacts'
        (self.corpus/'policies').mkdir(parents=True)
        rows=[{'graph':'g','script':'000.kiln.js','split':'train','source_sha256':'source'}]
        identity=hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()
        self.save(self.corpus/'manifest.json',{'format':'kiln-passnet-corpus/1','membership_sha256':identity,'numerical_policy':{'contraction':'separate'},'variants':rows})
        self.save(self.corpus/'measurement-plan.json',{'membership_sha256':identity,'numerical_policy':{'contraction':'separate'},'candidate_ids':['baseline','default']})
        for name in ['baseline','default']:
            policy={'id':name,'kind':'unchanged' if name=='baseline' else 'threshold'}
            if name=='default':policy['max_work_growth']=1.02
            self.save(self.corpus/'policies'/(name+'.json'),policy)
            directory=self.artifacts/name;directory.mkdir(parents=True)
            self.save(directory/'000.kiln.json',{'compiler_policy':policy,'source':{'sha256':'source','contraction':'separate'},'kernels':[{'identity':'kernel','code':'original'}]})
            self.save(directory/'compile-receipt.json',{'format':'kiln-policy-compilation/2','membership_sha256':identity,'reference_domain_sha256':'domains','target':'a100','phase':'all','numerical_policy':{'contraction':'separate'},'policy':policy,'records':[{'graph':'g','split':'train','status':'compiled','artifact':'000.kiln.json','fingerprint':'equal','kernel_count':1,'kernel_identities':['kernel']}]})

    def save(self,path,value):path.write_text(json.dumps(value))
    def edit(self,path,change):
        value=json.loads(path.read_text());change(value);self.save(path,value)

    def test_valid_controls(self):self.assertTrue(qualify(self.corpus,self.artifacts)['default_equals_unchanged'])

    def test_stale_compiled_policy_rejected(self):
        self.edit(self.artifacts/'default/compile-receipt.json',lambda r:r['policy'].update(max_work_growth=1.25))
        with self.assertRaisesRegex(ValueError,'Declared policy'):qualify(self.corpus,self.artifacts)

    def test_distinct_executables_cannot_share_timing(self):
        self.edit(self.artifacts/'default/000.kiln.json',lambda r:r['kernels'][0].update(code='different'))
        with self.assertRaisesRegex(ValueError,'fingerprint aliases'):qualify(self.corpus,self.artifacts)

    def test_target_changes_rejected(self):
        self.edit(self.artifacts/'default/compile-receipt.json',lambda r:r.update(target='other'))
        with self.assertRaisesRegex(ValueError,'target mismatch'):qualify(self.corpus,self.artifacts)

    def test_numerical_contract_changes_rejected(self):
        self.edit(self.artifacts/'default/compile-receipt.json',lambda r:r.update(numerical_policy={'contraction':'allow'}))
        with self.assertRaisesRegex(ValueError,'numerical contract mismatch'):qualify(self.corpus,self.artifacts)

    def test_training_only_artifacts_do_not_qualify_full_corpus(self):
        self.edit(self.artifacts/'default/compile-receipt.json',lambda r:r.update(phase='train'))
        with self.assertRaisesRegex(ValueError,'compilation scope'):qualify(self.corpus,self.artifacts)

    def add_candidate(self):
        name='candidate'
        self.edit(self.corpus/'measurement-plan.json',lambda p:p['candidate_ids'].append(name))
        policy={'id':name,'kind':'threshold','max_work_growth':1.25}
        self.save(self.corpus/'policies'/(name+'.json'),policy)
        (self.artifacts/name).mkdir()
        receipt=json.loads((self.artifacts/'default/compile-receipt.json').read_text())
        receipt['policy']=policy
        self.save(self.artifacts/name/'compile-receipt.json',receipt)
        artifact=json.loads((self.artifacts/'default/000.kiln.json').read_text());artifact['compiler_policy']=policy
        self.save(self.artifacts/name/'000.kiln.json',artifact)

    def fail(self,name,index=0):
        def change(receipt):
            previous=receipt['records'][index]
            receipt['records'][index]={'graph':previous['graph'],'split':previous['split'],
                                      'status':'failed','error':'controlled compiler rejection'}
        self.edit(self.artifacts/name/'compile-receipt.json',change)

    def test_candidate_failure_survives_qualification_and_selection(self):
        self.add_candidate();self.fail('candidate')
        gate=qualify(self.corpus,self.artifacts)
        self.assertEqual(gate['artifact_sha256']['candidate'],[None])
        self.assertEqual(gate['semantic_sha256']['candidate'],[None])
        self.assertEqual(gate['compile_failures']['candidate'][0]['graph'],'g')
        compiled={name:json.loads((self.artifacts/name/'compile-receipt.json').read_text()) for name in ['baseline','default','candidate']}
        bindings,groups=measurement_groups(compiled,list(compiled),0)
        self.assertEqual(bindings['baseline'],bindings['default'])
        self.assertNotEqual(bindings['candidate'],bindings['baseline'])
        groups[bindings['baseline']].update(status='measured',e2e_median_ms=10)
        measurement={'phase':'train','status':'complete','policies':list(compiled),'plan':{'candidate_ids':list(compiled)},
                     'expected_graphs':['g'],'records':[{'graph':'g','split':'train','sample':'family','bindings':bindings,'measurements':groups}]}
        ranking=rank_training(measurement)
        self.assertEqual(ranking[0]['policy'],'baseline')
        candidate=next(row for row in ranking if row['policy']=='candidate')
        self.assertEqual(candidate['failures'],['g']);self.assertFalse(candidate['eligible'])

    def test_failed_controls_remain_fatal(self):
        self.fail('default')
        with self.assertRaisesRegex(ValueError,'Control compilation failed'):qualify(self.corpus,self.artifacts)

    def test_missing_and_unknown_candidate_outcomes_remain_fatal(self):
        self.add_candidate()
        self.edit(self.artifacts/'candidate/compile-receipt.json',lambda r:r['records'][0].update(status='skipped'))
        with self.assertRaisesRegex(ValueError,'Unknown compilation'):qualify(self.corpus,self.artifacts)
        self.edit(self.artifacts/'candidate/compile-receipt.json',lambda r:r.update(records=[]))
        with self.assertRaisesRegex(ValueError,'Incomplete compilation'):qualify(self.corpus,self.artifacts)

    def test_failure_requires_diagnostic_and_keeps_split_identity(self):
        self.add_candidate();self.fail('candidate')
        self.edit(self.artifacts/'candidate/compile-receipt.json',lambda r:r['records'][0].update(error=''))
        with self.assertRaisesRegex(ValueError,'requires a diagnostic'):qualify(self.corpus,self.artifacts)
        self.edit(self.artifacts/'candidate/compile-receipt.json',lambda r:r['records'][0].update(error='failure',split='heldout'))
        with self.assertRaisesRegex(ValueError,'split mismatch'):qualify(self.corpus,self.artifacts)

    def test_heldout_failure_does_not_disqualify_training_candidate(self):
        self.add_candidate()
        manifest=json.loads((self.corpus/'manifest.json').read_text())
        manifest['variants'].append({**manifest['variants'][0],'graph':'h','split':'heldout'})
        identity=hashlib.sha256(json.dumps(manifest['variants'],sort_keys=True).encode()).hexdigest()
        manifest['membership_sha256']=identity;self.save(self.corpus/'manifest.json',manifest)
        self.edit(self.corpus/'measurement-plan.json',lambda p:p.update(membership_sha256=identity))
        for name in ['baseline','default','candidate']:
            def add_heldout(receipt):
                receipt['membership_sha256']=identity
                receipt['records'].append({**receipt['records'][0],'graph':'h','split':'heldout'})
            self.edit(self.artifacts/name/'compile-receipt.json',add_heldout)
        self.fail('candidate',1)
        gate=qualify(self.corpus,self.artifacts)
        self.assertEqual(gate['compile_failures']['candidate'][0]['split'],'heldout')
        compiled={name:json.loads((self.artifacts/name/'compile-receipt.json').read_text()) for name in ['baseline','default','candidate']}
        bindings,groups=measurement_groups(compiled,list(compiled),0)
        groups[bindings['baseline']].update(status='measured',e2e_median_ms=10)
        measurement={'phase':'train','status':'complete','policies':list(compiled),'plan':{'candidate_ids':list(compiled)},
                     'expected_graphs':['g'],'records':[{'graph':'g','split':'train','sample':'family','bindings':bindings,'measurements':groups}]}
        candidate=next(row for row in rank_training(measurement) if row['policy']=='candidate')
        self.assertTrue(candidate['eligible'])
        heldout_bindings,heldout_groups=measurement_groups(compiled,list(compiled),1)
        self.assertEqual(heldout_groups[heldout_bindings['candidate']]['status'],'compile_failed')
