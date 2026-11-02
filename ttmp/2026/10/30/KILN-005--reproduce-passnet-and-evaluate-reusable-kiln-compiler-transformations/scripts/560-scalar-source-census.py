"""Record actual source calls behind the frozen post-softmax blocked records."""
import ast
import json
from collections import Counter
from pathlib import Path
T=Path(__file__).resolve().parent.parent
records=json.loads((T/'sources/import-audit-after-softmax.json').read_text())['records']
counts=Counter();examples={}
for row in records:
    p=T/'sources/upstream'/row['graph']/'model.py'
    if not p.exists(): continue
    for n in ast.walk(ast.parse(p.read_text())):
        if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in {'hardtanh','clamp','clamp_','pow','cos','sin'}:
            text=ast.unparse(n); counts[text]+=1;examples.setdefault(text,str(p.relative_to(T)))
result={'source':'sources/import-audit-after-softmax.json','calls':[{'call':call,'count':n,'example':examples[call]} for call,n in counts.most_common()]}
(T/'sources/scalar-source-census.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
