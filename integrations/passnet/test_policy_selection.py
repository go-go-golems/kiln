import unittest
from select_policy import rank_training


class SelectionTests(unittest.TestCase):
    def fixture(self):
        rows=[]
        for i,(family,latency) in enumerate([('A',5),('A',5),('B',20)]):
            rows.append({'graph':str(i),'split':'train','sample':family,'bindings':{'baseline':'base','candidate':'changed'},
                         'measurements':{'base':{'status':'measured','e2e_median_ms':10},'changed':{'status':'measured','e2e_median_ms':latency}}})
        return {'phase':'train','status':'complete','policies':['baseline','candidate'],'expected_graphs':['0','1','2'],'plan':{'candidate_ids':['baseline','candidate']},'records':rows}

    def test_families_have_equal_weight(self):
        ranking=rank_training(self.fixture())
        self.assertEqual(ranking[0]['policy'],'baseline')
        self.assertAlmostEqual(ranking[1]['family_balanced_speedup'],1.0)

    def test_heldout_feedback_rejected(self):
        data=self.fixture();data['records'][0]['split']='heldout'
        with self.assertRaisesRegex(ValueError,'Held-out'):rank_training(data)

    def test_failed_candidate_ineligible(self):
        data=self.fixture();data['records'][0]['measurements']['changed']['status']='correctness_failed'
        ranking=rank_training(data)
        self.assertFalse(next(r for r in ranking if r['policy']=='candidate')['eligible'])

    def test_missing_training_graph_rejected(self):
        data=self.fixture();data['records'].pop()
        with self.assertRaisesRegex(ValueError,'membership'):rank_training(data)
