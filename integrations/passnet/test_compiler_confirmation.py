import copy
import unittest
from compiler_confirmation import summarize

class CompilerConfirmationTests(unittest.TestCase):
    def fixture(self):
        manifest={'membership_sha256':'fixed','variants':[{'graph':'g','model':'m','sample':'s','category':'matrix'}]}
        plan={'scope':'test','repeats':3}
        def measure(ms):return {'status':'measured','e2e_median_ms':ms,'stream_elapsed_median_ms':ms,'rounds':[{'attempts':[{'e2e_ms':{'median':ms}}]} for _ in range(3)]}
        result={'status':'complete','records':[{'graph':'g','model':'m','sample':'s','bindings':{'baseline':'a','candidate':'b'},'measurements':{'a':measure(2),'b':measure(1)}}]}
        return manifest,plan,result
    def test_complete_fixed_pair_and_exact_alias(self):
        manifest,plan,result=self.fixture();summary=summarize(manifest,plan,result)
        self.assertTrue(summary['qualified']);self.assertEqual(summary['family_balanced_e2e_speedup'],2)
        result['records'][0]['bindings']['candidate']='a'
        alias=summarize(manifest,plan,result)
        self.assertEqual(alias['changed_executables'],0);self.assertEqual(alias['family_balanced_e2e_speedup'],1)
    def test_failures_disable_aggregate_instead_of_filtering(self):
        for status in ['compile_failed','correctness_failed','reference_failed','timing_unstable','measurement_failed']:
            manifest,plan,result=self.fixture();result['records'][0]['measurements']['b']['status']=status
            summary=summarize(manifest,plan,result)
            self.assertFalse(summary['qualified']);self.assertEqual(summary['graphs'],1);self.assertIsNone(summary['family_balanced_e2e_speedup']);self.assertEqual(len(summary['failures']),1)
        manifest,plan,result=self.fixture();result['records'][0]['reference_error']='source failure'
        self.assertFalse(summarize(manifest,plan,result)['qualified'])
    def test_incomplete_membership_and_repeat_budget_rejected(self):
        manifest,plan,result=self.fixture();missing=copy.deepcopy(result);missing['records']=[]
        with self.assertRaisesRegex(ValueError,'Incomplete'):summarize(manifest,plan,missing)
        result['records'][0]['measurements']['b']['rounds'].pop()
        self.assertFalse(summarize(manifest,plan,result)['qualified'])

if __name__=='__main__':unittest.main()
