"""Check this diagnostic checkpoint without turning it into coverage evidence."""
import hashlib
import json
from pathlib import Path

ticket = Path(__file__).resolve().parents[1]
source = ticket / 'sources'
load = lambda name: json.loads((source / name).read_text())
counterfactual = load('singleton-accumulation-counterfactual-v1.json')
rows = {row['mode']: row for row in counterfactual['records']}
assert rows['unchanged']['against_loop']['failed'] == 2
assert rows['frontend-conv-fp32']['against_loop']['different'] == 0
assert rows['tensor-softmax-sum-fp32']['against_loop']['failed'] == 2
assert rows['tensor-all-sums-fp32']['against_loop']['different'] == 0
witness_path = source / 'singleton-precision-witness-v1.json'
witness = load(witness_path.name)
assert witness['original_batch'] == 35
assert witness['input']['shape'] == [1, 608, 8, 6]
assert len(witness['input']['data']) == 608 * 48
assert len(witness['frontend_output']) == len(witness['loop_output']) == 48
native = load('singleton-native-precision-v1.json')
assert native['witness_sha256'] == hashlib.sha256(witness_path.read_bytes()).hexdigest()
assert native == load('singleton-native-precision-v1.stdout.log')
assert len(native['records']) == 6
gpu = next(row for row in native['records'] if row['device'] == 'cuda' and row['matches_program_dtype'])
assert gpu['against_frontend']['different'] == 0
assert gpu['against_loop']['failed'] == 2
assert gpu['output'] == witness['frontend_output']
assert all(row['matches_program_dtype'] == (row['dtype'] == 'torch.float16') for row in native['records'])
files = [*sorted((ticket / 'scripts').glob('41[5-9]-*')),
         *[source / name for name in ['singleton-export-check-diagnostic-v1.json',
            'singleton-accumulation-counterfactual-v1.json', witness_path.name,
            'singleton-native-precision-v1.json', 'singleton-native-precision-v1.stdout.log',
            'singleton-native-precision-v1.stderr.log']]]
receipt = {'format': 'kiln-singleton-precision-evidence-verification/1', 'status': 'verified',
           'compiler_changed': False, 'benchmark_coverage_changed': False,
           'scope': 'One deterministic export discrepancy and one native batch1 row; not full-shape qualification.',
           'files': {str(path.relative_to(ticket)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}}
(source / 'singleton-precision-evidence-verification-v1.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('Verified local accumulation isolation, native witness byte identity and unchanged coverage scope.')
