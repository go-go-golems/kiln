"""Audit literal return_indices flags in checked-in PassNet model sources."""
import ast,json
from pathlib import Path
from collections import Counter
counts=Counter();examples={}
for path in Path('sources/passnet/upstream/graphs/hf_subgraphs_v2').rglob('model.py'):
    text=path.read_text()
    if 'max_pool2d' not in text:continue
    for node in ast.walk(ast.parse(text)):
        if not isinstance(node,ast.Call):continue
        target=ast.unparse(node.func)
        if not target.endswith('max_pool2d'):continue
        flag=next((kw.value for kw in node.keywords if kw.arg=='return_indices'),node.args[6] if len(node.args)>6 else ast.Constant(value=False))
        try:key=str(ast.literal_eval(flag))
        except (ValueError,TypeError):key='dynamic'
        counts[key]+=1;examples.setdefault(key,str(path))
out=Path(__file__).resolve().parents[1]/'sources/max-pooling-call-audit-v1.json'
out.write_text(json.dumps(dict(counts=counts,examples=examples),indent=2)+'\n')
print(dict(counts))
