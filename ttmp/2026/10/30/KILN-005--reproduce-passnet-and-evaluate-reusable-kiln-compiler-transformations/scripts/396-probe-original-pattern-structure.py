#!/usr/bin/env python3
"""Diagnose symbolic FX versus Dynamo structure without invoking generated kernels."""
import ast,copy,hashlib,importlib.util,json,sys
from pathlib import Path
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').is_dir());sys.path.insert(0,str(repo/'integrations/passnet'))
from fx_normalize import normalize_arguments
root=p/'sources/original-agent-smoke-terminal-v1';candidate=root/'best-snapshot/pass_dir/FuseConv2dRelu.py';source=ast.parse(candidate.read_text());pattern=next(node for node in source.body if isinstance(node,ast.FunctionDef) and node.name=='pattern');namespace={'torch':torch};exec(compile(ast.Module(body=[copy.deepcopy(pattern)],type_ignores=[]),str(candidate),mode='exec'),namespace)
model_path=p/'sources/upstream/graphs/fusible_subgraphs/samples/timm/crossvit_15_dagger_240.in1k/_decomposed/crossvit_15_dagger_240.in1k_0/_decomposed/crossvit_15_dagger_240.in1k_0_start14_end16_4/model.py';spec=importlib.util.spec_from_file_location('source_model',model_path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);inputs=(torch.randn(1,3,5,5),torch.randn(4),torch.randn(4,3,3,3));captured=[]
def backend(graph,examples):captured.append(graph);return graph.forward
torch._dynamo.reset();result=torch.compile(module.GraphModule(),backend=backend,fullgraph=True)(*inputs);assert len(captured)==1
expected=module.GraphModule()(*inputs);torch.testing.assert_close(result,expected)
replacement_source=p/'sources/upstream/pass_bench/torch/custom_replacement.py';replacement_spec=importlib.util.spec_from_file_location('original_custom_replacement',replacement_source);replacement_module=importlib.util.module_from_spec(replacement_spec);replacement_spec.loader.exec_module(replacement_module)
forced=replacement_module.force_args_symbolic_trace(namespace['pattern'])
traced=symbolic_trace(namespace['pattern']);graph=captured[0];forced_matches=len(SubgraphMatcher(forced.graph).match(graph.graph));forced_pattern=str(forced.graph)
raw_matches=len(SubgraphMatcher(traced.graph).match(graph.graph));raw_pattern=str(traced.graph);raw_graph=str(graph.graph)
pattern_changes=normalize_arguments(traced);graph_changes=normalize_arguments(graph);normalized_matches=len(SubgraphMatcher(traced.graph).match(graph.graph))
facts={'format':'kiln-original-pattern-structure/1','torch_version':torch.__version__,'device':'cpu','input_shapes':[list(x.shape) for x in inputs],'candidate_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'raw_matches':raw_matches,'original_forced_matches':forced_matches,'original_forced_pattern':forced_pattern,'original_tracer_source_sha256':hashlib.sha256(replacement_source.read_bytes()).hexdigest(),'normalized_matches':normalized_matches,'pattern_changes':pattern_changes,'graph_changes':graph_changes,'raw_pattern':raw_pattern,'raw_dynamo_graph':raw_graph,'scope':'Diagnostic only. Small CPU shapes, original source body and saved pattern; no generated kernel or evaluator mutation.'}
with (root/'cpu-pattern-structure-v2.json').open('x') as f:f.write(json.dumps(facts,indent=2)+'\n')
print(json.dumps(facts,indent=2))
