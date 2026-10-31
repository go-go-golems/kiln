"""Loop/accounting tests with controlled provider replies; not model evidence."""
import json
from pathlib import Path
import re
import tempfile
import unittest

from run_native_policy_agent import run_batch, parse_action, dispatch_response, LocalCompletion
from native_policy_task import NativePolicyTask


class ActionDouble:
    def __init__(self,name,parameters):self.function_name,self.parameters=name,parameters
    @classmethod
    def from_string(cls,text):
        return cls(re.search(r'<function\s*=\s*([^>]+)>',text)[1],
                   dict(re.findall(r'<parameter\s*=\s*([^>]+)>(.*?)</parameter>',text,re.DOTALL)))
    def to_xml_string(self):return self.function_name


class StepDouble:
    def __init__(self,**fields):self.fields=fields
    def model_dump(self):return self.fields


class TaskDouble:
    def __init__(self):self.calls=[]
    def call(self,name,parameters):
        self.calls.append((name,parameters))
        return {'status':'finished'} if name=='finish' else {'status':'rejected','remaining':9}
    def finish(self):return {'status':'finished','evaluation_status':'not_run'}


def response(text='<function=finish></function>',completion=4,finish='stop'):
    return json.dumps({'choices':[{'message':{'content':text},'finish_reason':finish}],
                       'usage':{'prompt_tokens':10,'completion_tokens':completion,'total_tokens':10+completion}})


class NativeAgentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.output=Path(self.temp.name)/'agent';self.task=TaskDouble()

    def run_agent(self,query,**kwargs):
        return run_batch(self.task,self.output,model='test',max_steps=kwargs.get('max_steps',3),
                         completion_budget=kwargs.get('completion_budget',8),per_turn_tokens=4,
                         proposal_budget=2,query=query,action_type=ActionDouble,step_type=StepDouble)

    def test_finished_records_raw_and_usage(self):
        raw=response()
        result=self.run_agent(lambda request:raw)
        self.assertEqual(result['exit_reason'],'finished')
        self.assertEqual(result['usage']['total_tokens'],14)
        self.assertEqual((self.output/'step-0000.response.json').read_text(),raw)
        self.assertEqual(self.task.calls,[('finish',{})])

    def test_no_hidden_retry_on_provider_failure(self):
        requests=[]
        def query(request):
            requests.append(request);raise TimeoutError('controlled timeout')
        result=self.run_agent(query)
        self.assertEqual(len(requests),1)
        self.assertEqual(result['exit_reason'],'provider_error')
        self.assertTrue((self.output/'step-0000.error.json').exists())

    def test_missing_usage_prevents_tool_execution(self):
        raw=json.loads(response());del raw['usage']
        result=self.run_agent(lambda request:json.dumps(raw))
        self.assertEqual(result['exit_reason'],'invalid_provider_usage')
        self.assertEqual(self.task.calls,[])

    def test_token_budget_caps_last_request_and_stops(self):
        requests=[]
        def query(request):
            requests.append(request)
            return response('<function=inspect_training></function>',request['max_tokens'])
        result=self.run_agent(query,completion_budget=6)
        self.assertEqual([r['max_tokens'] for r in requests],[4,2])
        self.assertEqual(result['exit_reason'],'completion_budget_exhausted')
        self.assertEqual(result['usage']['completion_tokens'],6)

    def test_partial_completion_and_invalid_actions_do_not_dispatch(self):
        replies=iter([response(finish='length'),response('no action'),response('<function=x></function><function=y></function>')])
        result=self.run_agent(lambda request:next(replies),completion_budget=12)
        self.assertEqual(result['exit_reason'],'step_budget_exhausted')
        self.assertEqual(self.task.calls,[])
        self.assertEqual(result['steps'],3)

    def test_duplicate_parameters_reach_submission_as_invalid(self):
        text='<function=submit_policy><parameter=policy_json>{}</parameter><parameter=policy_json>{}</parameter></function>'
        result=self.run_agent(lambda request:response(text),max_steps=1)
        self.assertEqual(self.task.calls,[('submit_policy',None)])
        self.assertEqual(result['steps'],1)

    def actual_task(self,budget):
        manifest={'membership_sha256':'a'*64,'numerical_policy':{'contraction':'separate'},
                  'variants':[{'graph':'train','split':'train'}]}
        receipt={'membership_sha256':'a'*64,'numerical_policy':{'contraction':'separate'},'phase':'train',
                 'records':[{'graph':'train','split':'train','status':'compiled','decisions':[
                     {'originalWork':100,'fusedWork':101,'producerElements':16,'consumerCount':1}]}]}
        return NativePolicyTask(Path(self.temp.name)/'task',manifest,receipt,proposal_budget=budget)

    def test_multi_action_rejection_charges_each_identifiable_submission(self):
        self.task=self.actual_task(2)
        text='<function=submit_policy><parameter=policy_json>{}</parameter></function>'*2
        result=self.run_agent(lambda request:response(text))
        self.assertEqual(result['exit_reason'],'proposal_budget_exhausted')
        self.assertEqual(result['task']['attempts'],2)
        self.assertEqual(result['task']['unique_artifacts'],0)
        self.assertEqual(result['submission_accounting'],{'identified_submissions':2,'charged_submissions':2,'unadmitted_submissions':0})
        self.assertEqual(len(list((Path(self.temp.name)/'task').glob('*.result.json'))),2)

    def test_excess_multi_action_attempts_do_not_exceed_budget(self):
        task=self.actual_task(1)
        text='<function=submit_policy></function>'*3
        _,_,_,observation,accounting=dispatch_response(text,'stop',task,ActionDouble)
        self.assertEqual(observation['remaining'],0)
        self.assertEqual(accounting,{'identified_submissions':3,'charged_submissions':1,'unadmitted_submissions':2})
        self.assertEqual(task.finish()['attempts'],1)

    def test_truncated_submission_is_charged_without_execution(self):
        task=self.actual_task(1)
        _,_,_,observation,accounting=dispatch_response('<function=submit_policy','length',task,ActionDouble)
        self.assertEqual(observation['status'],'incomplete_completion')
        self.assertEqual(accounting['charged_submissions'],1)
        self.assertEqual(task.finish()['unique_artifacts'],0)

    def test_extra_incomplete_action_cannot_hide_behind_complete_action(self):
        task=self.actual_task(1)
        _,_,_,observation,accounting=dispatch_response('<function=finish></function><function=submit_policy','stop',task,ActionDouble)
        self.assertEqual(observation['status'],'invalid_action')
        self.assertEqual(accounting['charged_submissions'],1)

    def test_local_endpoint_is_explicit(self):
        for url in ['https://example.com/v1','http://example.com/v1','http://a:b@localhost/v1','http://localhost/v1?x=y']:
            with self.assertRaises(ValueError):LocalCompletion(url,30)
        self.assertEqual(LocalCompletion('http://127.0.0.1:8041/v1',30).url,
                         'http://127.0.0.1:8041/v1/chat/completions')


if __name__=='__main__':unittest.main()
