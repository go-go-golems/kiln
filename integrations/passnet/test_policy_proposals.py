import copy
import unittest
from propose_policy import propose


class ProposalTests(unittest.TestCase):
    def inputs(self):
        manifest={'membership_sha256':'frozen','variants':[{'graph':'train','split':'train'},{'graph':'heldout','split':'heldout'}]}
        receipt={'membership_sha256':'frozen','records':[
            {'graph':'train','split':'train','status':'compiled','decisions':[
                {'originalWork':100,'fusedWork':90,'producerElements':10,'consumerCount':1,'accepted':True},
                {'originalWork':1000,'fusedWork':1001,'producerElements':100,'consumerCount':2,'accepted':True}]},
            {'graph':'heldout','split':'heldout','status':'compiled','decisions':[{'untrusted':'must not be consulted'}]}]}
        return manifest,receipt

    def test_heldout_changes_cannot_change_proposals(self):
        manifest,receipt=self.inputs();want=propose(manifest,receipt)
        changed=copy.deepcopy(receipt);changed['records'][1].update(status='failed',decisions=[{'originalWork':float('nan')}])
        self.assertEqual(propose(manifest,changed),want)
        self.assertEqual(len(want['policies']),12)
        self.assertEqual(want['cuts'],{'large_producer':10,'small_producer':10,'high_work':100})

    def test_missing_or_mislabeled_training_trace_rejected(self):
        manifest,receipt=self.inputs();receipt['records'][0]['split']='heldout'
        with self.assertRaisesRegex(ValueError,'training traces'):propose(manifest,receipt)
        receipt['records'].pop(0)
        with self.assertRaisesRegex(ValueError,'Incomplete'):propose(manifest,receipt)

    def test_nonfinite_features_rejected(self):
        manifest,receipt=self.inputs();receipt['records'][0]['decisions'][0]['originalWork']=float('inf')
        with self.assertRaisesRegex(ValueError,'feature'):propose(manifest,receipt)
