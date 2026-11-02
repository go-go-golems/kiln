#!/usr/bin/env python3
"""Static evaluation corpus census: parse Python without importing graph code."""
import ast
from collections import Counter, defaultdict
import json
from pathlib import Path

TICKET=Path(__file__).resolve().parents[1]
UPSTREAM=TICKET/'sources/upstream'
tasks=(UPSTREAM/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
ops, dtype_counts, task_ops = Counter(),Counter(),defaultdict(set)
records=[]
def target(node):
    if isinstance(node,ast.Name): return node.id
    if isinstance(node,ast.Attribute):
        parent=target(node.value)
        return f'{parent}.{node.attr}' if parent else None
    return None
for task in tasks:
    for graph in (UPSTREAM/task/'graph_list.txt').read_text().splitlines():
        root=UPSTREAM/graph
        tree=ast.parse((root/'model.py').read_text())
        calls=Counter()
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name=target(node.func) or '<dynamic>'
                if isinstance(node.func, ast.Attribute) and not name.startswith(('torch.', 'self.')):
                    name='Tensor.'+node.func.attr
                calls[name]+=1
            elif isinstance(node, ast.BinOp):
                calls['syntax.'+type(node.op).__name__]+=1
            elif isinstance(node, ast.UnaryOp):
                calls['syntax.'+type(node.op).__name__]+=1
            elif isinstance(node, ast.Subscript):
                calls['syntax.Subscript']+=1
        # class base Module is not an executed graph op; forward calls are retained.
        dtypes=set()
        for filename in ['input_meta.py','weight_meta.py']:
            meta=ast.parse((root/filename).read_text())
            for n in ast.walk(meta):
                if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='dtype' for t in n.targets) and isinstance(n.value,ast.Constant):
                    dtypes.add(n.value.value)
        ops.update(calls)
        for op in calls: task_ops[op].add(task)
        dtype_counts.update(dtypes)
        records.append({'task':task,'graph':graph,'calls':dict(calls),'dtypes':sorted(dtypes)})
report={'tasks':len(tasks),'graphs':len(records),'call_occurrences':dict(ops.most_common()),'tasks_per_call':{k:len(v) for k,v in sorted(task_ops.items(),key=lambda kv:-len(kv[1]))},'graphs_per_dtype':dict(dtype_counts),'records':records}
(TICKET/'sources/operator-inventory.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'tasks':len(tasks),'graphs':len(records),'top_calls':ops.most_common(20),'graphs_per_dtype':dict(dtype_counts)},indent=2))
