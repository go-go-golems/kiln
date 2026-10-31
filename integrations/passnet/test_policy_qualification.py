import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from qualify_policies import qualify


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
