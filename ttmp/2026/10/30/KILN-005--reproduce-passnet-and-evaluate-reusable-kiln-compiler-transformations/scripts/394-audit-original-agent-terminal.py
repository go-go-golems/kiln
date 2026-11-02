#!/usr/bin/env python3
"""Derive evaluator outcomes from tool evidence, rejecting placeholder reward."""
import ast,collections,hashlib,json,re
from pathlib import Path
p=Path(__file__).resolve().parents[1];root=p/'sources/original-agent-smoke-terminal-v1';trajectory=root/'original-agent-smoke-v5/original-shipping-smoke-v5.jsonl';d=json.loads(trajectory.read_text());counts=collections.Counter();evaluations=[]
for step in d['trajectory_steps']:
 match=re.search(r'<function=([^>]*)>',step['action']);tool=match.group(1) if match else 'unparsed';counts[tool or 'missing_function_call']+=1
 if tool=='pass_evaluator':
  text=step['observation'];scores=[json.loads(raw)['score'] for raw in re.findall(r'Score data:\s*(\{.*?\})',text,re.S)];assert len(scores)==1
  evaluations.append({'step':step['step_idx'],'score':scores[0],'explicit_match_failure':'Has Any pass matched? [False]' in text,'explicit_tool_failure':'FAIL:' in text,'observation_sha256':hashlib.sha256(text.encode()).hexdigest()})
assert evaluations
files=[];pattern=re.compile(r'^-{20} (pass_dir/[^\n]+) -{20}\n',re.M);headers=list(pattern.finditer(d['output_patch']))
for index,header in enumerate(headers):
 relative=Path(header.group(1));assert not relative.is_absolute() and '..' not in relative.parts
 end=headers[index+1].start() if index+1<len(headers) else len(d['output_patch']);content=d['output_patch'][header.end():end];assert content.endswith('\n\n');content=content[:-2]
 target=root/'best-snapshot'/relative;target.parent.mkdir(parents=True,exist_ok=True)
 with target.open('x') as file:file.write(content)
 row={'path':str(relative),'bytes':len(content.encode()),'sha256':hashlib.sha256(content.encode()).hexdigest()}
 if target.suffix=='.py':
  tree=ast.parse(content);row['empty_functions']=[node.name for node in ast.walk(tree) if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and len(node.body)==1 and isinstance(node.body[0],ast.Pass)]
 files.append(row)
snapshot_score=float((root/'best-snapshot/pass_dir/score.txt').read_text());assert snapshot_score==max(row['score'] for row in evaluations)
facts={'format':'kiln-original-passagent-terminal-audit/1','trajectory_sha256':hashlib.sha256(trajectory.read_bytes()).hexdigest(),'exit_reason':d['exit_reason'],'steps':len(d['trajectory_steps']),'actions':dict(counts),'evaluator_calls':evaluations,'best_recorded_evaluator_score':snapshot_score,'all_evaluations_rejected_at_matching':all(row['explicit_match_failure'] and row['explicit_tool_failure'] for row in evaluations),'accepted_implementation':False,'top_level_reward':d['reward'],'top_level_test_output':d['test_output'],'top_level_reward_is_placeholder':d['test_output']=='Reward calculation not yet implemented','max_prompt_tokens':max(s['token_usage_prompt'] for s in d['trajectory_steps']),'best_snapshot':files,'provenance':'Independently parse original tool Score data JSON and serialized pass snapshot. No evaluator or original agent source changed.','limitation':'A shipping smoke task, not the official200-task result; candidate no-match cause still requires structural diagnosis.'}
(root/'verified-facts.json').write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps({key:facts[key] for key in ['exit_reason','steps','actions','best_recorded_evaluator_score','all_evaluations_rejected_at_matching','top_level_reward_is_placeholder','max_prompt_tokens']},indent=2))
