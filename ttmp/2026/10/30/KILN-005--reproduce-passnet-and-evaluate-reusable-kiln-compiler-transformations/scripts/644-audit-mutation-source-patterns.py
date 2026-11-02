"""Classify source-level mutation blockers before designing Kiln effect lowering."""

import ast
import collections
import hashlib
import json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
sources = ticket / 'sources'
upstream = sources / 'upstream'
audit = json.loads((sources / 'stack-unbind-batch-import-v1.json').read_text())['records']
rows = []
for record in audit:
    error = record.get('error', '')
    if not any(term in error for term in ('inplace', 'in-place', 'mutation/alias', 'relu_')):
        continue
    source = (upstream / record['graph'] / 'model.py').read_text()
    tree = ast.parse(source)
    forward = next(node for cls in tree.body if isinstance(cls, ast.ClassDef)
                   for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'forward')
    mutations = []
    for node in ast.walk(forward):
        if isinstance(node, ast.AugAssign):
            operand = ast.unparse(node.target)
            mutations.append({'kind': 'augassign', 'operation': type(node.op).__name__,
                              'operand': operand, 'source_line': node.lineno})
        if isinstance(node, ast.Call):
            inplace = any(keyword.arg == 'inplace' and isinstance(keyword.value, ast.Constant)
                          and keyword.value.value is True for keyword in node.keywords)
            positional_hardtanh = (ast.unparse(node.func) == 'torch.nn.functional.hardtanh'
                                   and len(node.args) >= 4 and isinstance(node.args[3], ast.Constant)
                                   and node.args[3].value is True)
            method_mutation = isinstance(node.func, ast.Attribute) and node.func.attr.endswith('_')
            if inplace or positional_hardtanh or method_mutation:
                operand = ast.unparse(node.args[0]) if node.args else ast.unparse(node.func.value)
                mutations.append({'kind': 'inplace_keyword' if inplace else 'positional_inplace' if positional_hardtanh else 'method',
                                  'operation': ast.unparse(node.func), 'operand': operand,
                                  'source_line': node.lineno})
    rows.append({'sample': record['sample'], 'graph': record['graph'], 'first_error': error,
                 'model_sha256': hashlib.sha256(source.encode()).hexdigest(),
                 'mutations': sorted(mutations, key=lambda item: item['source_line'])})
by_error = collections.Counter(row['first_error'] for row in rows)
first_operand = collections.Counter()
for row in rows:
    if row['mutations']:
        first_operand['input' if row['mutations'][0]['operand'].startswith('in_') else 'other'] += 1
    else:
        first_operand['unclassified'] += 1
result = {'format': 'kiln-mutation-source-audit/1', 'blocked_graphs': len(rows),
          'tasks': len({row['sample'] for row in rows}),
          'distinct_source_models': len({row['model_sha256'] for row in rows}),
          'first_errors': dict(by_error), 'first_mutation_operand': dict(first_operand),
          'records': rows}
output = sources / 'mutation-source-patterns-v1.json'
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ('blocked_graphs', 'tasks',
                                                'distinct_source_models', 'first_errors',
                                                'first_mutation_operand')}, indent=2))
