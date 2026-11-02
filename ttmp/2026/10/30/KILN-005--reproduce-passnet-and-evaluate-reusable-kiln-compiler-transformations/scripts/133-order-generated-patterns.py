#!/usr/bin/env python3
"""Apply source-arity specificity to an already generated investigation checkpoint."""
import ast,json,sys
from pathlib import Path
root=Path(sys.argv[1]);path=root/'sorted_output_pass_rule_names.json';names=json.loads(path.read_text())
def arity(name):
 tree=ast.parse((root/(name+'.py')).read_text())
 return len(next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='pattern').args.args)
names.sort(key=arity);path.write_text(json.dumps(names)+'\n');print([(name,arity(name)) for name in names])
