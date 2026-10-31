"""Run a bounded proposal batch using R2E-Gym actions/trajectory steps.

The repository-editing Agent.run and placeholder reward are intentionally not
used. This native lifecycle calls the local OpenAI-compatible endpoint directly,
with no hidden retries, and dispatches only the trusted native task's tools.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlparse
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

from native_policy_task import NativePolicyTask, _strict_json, _write_new


SYSTEM_PROMPT = """You propose reusable Kiln compiler fusion policies for a fixed training corpus.
The evaluator owns compilation, correctness, numerical settings and timing.
This is a proposal batch: you receive structural training features and validation
feedback, but no timing feedback during the batch. Accepted means valid policy
data, not a speedup. Submit distinct candidate programs within the stated budget.

Use exactly one XML tool action per reply:
<function=inspect_training></function>
<function=submit_policy><parameter=policy_json>JSON_OBJECT</parameter></function>
<function=finish></function>
There is no shell, file editor, external search, or access to held-out examples.

Policy JSON has format "kiln-fusion-policy/1", a lowercase alphanumeric/hyphen id,
and one kind:
- "threshold": max_work_growth, a finite number in [0,2].
- "decision-tree": tree.
- "selective": tree and consumer_tree.
- "region": max_work_growth in [0,2], launch_work in [0,1048576],
  materialization_work in [0,64]. Region weights express estimated work units.
- "unchanged": no program fields, retaining the existing default compiler.

A tree node is {"threshold": number}, {"accept": boolean}, or
{"if":{"feature":name,"op":comparison,"value":nonnegative_number},
 "then":node,"else":node}. Comparisons: lt, le, gt, ge, eq.
Aggregate features: originalWork, fusedWork, consumerCount, producerElements.
Consumer features: producerWork, consumerWork, fusedConsumerWork, consumerCount,
producerElements, consumerElements. The inspected default traces report aggregate
features only; do not invent measured consumer features or timing values.
Tree limits: 31 total nodes across both trees, maximum depth 6.
Aggregate threshold accepts fusedWork <= originalWork * threshold.
Consumer threshold accepts fusedConsumerWork <= consumerWork * threshold.
Every aggregate policy also obeys the hard 2x work-growth guard.
The default threshold is 1.02. Work is the compiler's estimated scalar work,
not GPU time. The region selector jointly models launch/materialization work.
Producer materialization remains charged when some consumers still need it.
Legality checks remain in the compiler; a policy only changes profitability.

Example: {"format":"kiln-fusion-policy/1","id":"candidate-a",
"kind":"threshold","max_work_growth":1.05}
Do not add numerical policies, tolerance changes, task identifiers, source code,
imports or evaluator controls to a proposal. Rejected and duplicate submissions
consume proposal slots. Every reply consumes a model step. Finish when done.
"""


def r2e_components():
    # Installed from the separately pinned framework; no dynamic installation.
    from r2egym.agenthub.action import Action
    from r2egym.agenthub.trajectory import TrajectoryStep
    return Action, TrajectoryStep


def parse_action(text, action_type):
    matches = list(re.finditer(r'<function\s*=\s*([^>]+)>(.*?)</function>', text, re.DOTALL))
    if len(matches) != 1:
        return '', {}, 'Expected exactly one complete tool action'
    match = matches[0]
    names = re.findall(r'<parameter\s*=\s*([^>]+)>', match.group(2))
    if len(names) != len(set(name.strip() for name in names)):
        # A recognized malformed submission still consumes its proposal slot.
        return match.group(1).strip(), None, 'Duplicate action parameters'
    action = action_type.from_string(match.group(0))
    return action.function_name, action.parameters, None


class LocalCompletion:
    """Explicit local-only provider; redirects and proxy configuration are unused."""
    def __init__(self, base_url, timeout):
        parsed = urlparse(base_url)
        if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1','localhost','::1')
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path.rstrip('/') != '/v1'):
            raise ValueError('Expected an explicit local http://host:port/v1 endpoint')
        self.url = base_url.rstrip('/')+'/chat/completions'
        self.timeout = timeout
        class NoRedirect(HTTPRedirectHandler):
            def redirect_request(self, request, fp, code, msg, headers, newurl):
                raise ValueError('Provider redirects are disabled')
        self.opener = build_opener(ProxyHandler({}),NoRedirect())

    def __call__(self, request):
        message = Request(self.url, data=json.dumps(request,allow_nan=False).encode(),
                          headers={'Content-Type':'application/json','Authorization':'Bearer EMPTY'})
        with self.opener.open(message,timeout=self.timeout) as response:
            # Do not follow a redirect to an unrelated provider.
            if response.url != self.url:
                raise ValueError('Unexpected provider redirect')
            return response.read().decode('utf-8')


def run_batch(task, output, *, model, max_steps, completion_budget,
              per_turn_tokens, query, action_type, step_type, proposal_budget):
    """No automatic query retries. Record raw response before interpreting it."""
    if any(type(value) is not int or value < 1 for value in
           [max_steps,completion_budget,per_turn_tokens,proposal_budget]):
        raise ValueError('Positive integer budgets required')
    output=Path(output)
    output.mkdir(parents=True,exist_ok=False)
    messages=[{'role':'system','content':SYSTEM_PROMPT},
              {'role':'user','content':f'Propose up to {proposal_budget} policies. You have {max_steps} model steps. Inspect training features first.'}]
    start=time.monotonic()
    totals={'prompt_tokens':0,'completion_tokens':0,'total_tokens':0}
    status='step_budget_exhausted'
    steps=[]
    _write_new(output/'config.json',{'format':'kiln-native-agent-batch/1', 'model':model,
        'max_steps':max_steps,'completion_budget':completion_budget,
        'per_turn_tokens':per_turn_tokens,'proposal_budget':proposal_budget,
        'system_prompt_sha256':hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest(),
        'retry_policy':'none','provider_mode':'local HTTP, XML actions, no native tool schemas',
        'evaluation_status':'not_run'})
    try:
        for index in range(max_steps):
            remaining=completion_budget-totals['completion_tokens']
            if remaining<=0:
                status='completion_budget_exhausted'
                break
            request={'model':model,'messages':copy.deepcopy(messages),'temperature':0,
                     'max_tokens':min(per_turn_tokens,remaining),'stream':False}
            prefix=output/f'step-{index:04d}'
            _write_new(prefix.with_suffix('.request.json'),request)
            query_start=time.monotonic()
            try:
                raw=query(request)
            except Exception as error:
                _write_new(prefix.with_suffix('.error.json'),{'error':str(error),'type':type(error).__name__})
                status='provider_error'
                break
            llm_seconds=time.monotonic()-query_start
            with prefix.with_suffix('.response.json').open('x') as stream:
                stream.write(raw)
            response=_strict_json(raw)
            usage=response.get('usage',{})
            if (any(type(usage.get(k)) is not int or usage[k]<0 for k in totals)
                    or usage['total_tokens']!=usage['prompt_tokens']+usage['completion_tokens']):
                status='invalid_provider_usage'
                break
            for key in totals: totals[key]+=usage[key]
            if usage['completion_tokens']>request['max_tokens']:
                status='provider_exceeded_completion_limit'
                break
            choice=response['choices'][0]
            message=choice['message']
            content=message.get('content') or ''
            if not isinstance(content,str):
                raise ValueError('Provider content is not text')
            env_start=time.monotonic()
            if choice.get('finish_reason')!='stop':
                # Partial policy text is retained, never executed.
                name,parameters,parse_error='',{},'Incomplete completion'
                observation={'status':'incomplete_completion','finish_reason':choice.get('finish_reason')}
            else:
                name,parameters,parse_error=parse_action(content,action_type)
                observation=task.call(name,parameters) if name else {'status':'invalid_action','error':parse_error}
            env_seconds=time.monotonic()-env_start
            done=observation.get('status') in ('finished','budget_exhausted') or observation.get('remaining')==0
            step=step_type(step_idx=index,thought=message.get('reasoning_content') or '',
                action=action_type(name,parameters or {}).to_xml_string(),
                observation=json.dumps(observation,allow_nan=False),done=done,
                info={'parse_error':parse_error,'finish_reason':choice.get('finish_reason')},
                token_usage_prompt=usage['prompt_tokens'],token_usage_completion=usage['completion_tokens'],
                token_usage_total=usage['total_tokens'],llm_exec_time=llm_seconds,
                env_exec_time=env_seconds,total_step_time=llm_seconds+env_seconds,
                total_time_traj=time.monotonic()-start,step_count=index+1)
            row=step.model_dump()
            _write_new(prefix.with_suffix('.trajectory-step.json'),row)
            steps.append(row)
            messages.extend([{'role':'assistant','content':content},
                             {'role':'user','content':json.dumps(observation,allow_nan=False)}])
            if done:
                status='finished' if observation.get('status')=='finished' else 'proposal_budget_exhausted'
                break
    except Exception as error:
        status='driver_error'
        _write_new(output/'error.json',{'type':type(error).__name__,'error':str(error)})
    finally:
        summary={'format':'kiln-native-agent-batch-result/1','exit_reason':status,
                 'model':model,'usage':totals,'steps':len(steps),'task':task.finish(),
                 'elapsed_seconds':time.monotonic()-start,'evaluation_status':'not_run'}
        _write_new(output/'result.json',summary)
    return summary


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['manifest','receipt','output']:parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--base-url',required=True)
    parser.add_argument('--model',required=True)
    parser.add_argument('--node',default='node')
    parser.add_argument('--proposal-budget',type=int,default=4)
    parser.add_argument('--max-steps',type=int,default=12)
    parser.add_argument('--completion-budget',type=int,default=16384)
    parser.add_argument('--per-turn-tokens',type=int,default=4096)
    parser.add_argument('--timeout',type=int,default=180)
    args=parser.parse_args()
    action_type,step_type=r2e_components()
    query=LocalCompletion(args.base_url,args.timeout)
    args.output.mkdir(parents=True,exist_ok=False)
    task=NativePolicyTask(args.output/'task',json.loads(args.manifest.read_text()),
                          json.loads(args.receipt.read_text()),proposal_budget=args.proposal_budget,node=args.node)
    result=run_batch(task,args.output/'agent',model=args.model,max_steps=args.max_steps,
        completion_budget=args.completion_budget,per_turn_tokens=args.per_turn_tokens,
        query=query,action_type=action_type,step_type=step_type,proposal_budget=args.proposal_budget)
    print(json.dumps(result,indent=2))
    if result['exit_reason'] in ('provider_error','driver_error','invalid_provider_usage','provider_exceeded_completion_limit'):
        raise SystemExit(1)


if __name__=='__main__':main()
