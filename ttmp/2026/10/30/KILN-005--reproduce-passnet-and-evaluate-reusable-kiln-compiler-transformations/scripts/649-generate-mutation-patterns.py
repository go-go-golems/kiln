"""Check source-derived PassBench pattern generation for all mutation-wave tasks."""

import json
import shutil
import sys
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
sources = ticket / 'sources'
sys.path.insert(0, str(repo / 'integrations/passnet'))
from generate_pass import generate

plan = json.loads((sources / 'input-mutation-wave-task-plan-v1.json').read_text())
compiled = sources / 'input-mutation-wave-local-compile-v1'
output = sources / 'input-mutation-wave-patterns-v1'
assert not output.exists(), 'Preserve earlier pattern evidence'
output.mkdir()
rows = []
for task in plan['tasks']:
    source = compiled / f"task-{task['index']:03d}" / 'corpus'
    destination = output / f"task-{task['index']:03d}"
    corpus = destination / 'corpus'
    corpus.mkdir(parents=True)
    shutil.copy2(source / 'manifest.json', corpus / 'manifest.json')
    for script in source.glob('*.kiln.js'):
        shutil.copy2(script, corpus / script.name)
    passes = destination / 'passes'
    row = {'index': task['index'], 'graphs': task['graphs']}
    try:
        generate(corpus, sources / 'upstream', passes, corpus)
        manifest = json.loads((corpus / 'manifest.json').read_text())
        row['status'] = 'generated'
        row['patterns'] = len(list(passes.glob('KilnPattern*.py')))
        row['effect_variants'] = sum(bool(v['input_mutations']) for v in manifest['variants'])
    except Exception as error:
        row['status'] = 'failed'
        row['error'] = str(error)
    rows.append(row)
    (output / 'receipt.json').write_text(json.dumps({'format': 'kiln-mutation-pattern-generation/1',
                                                      'scope': 'CPU pattern generation only; no actual PassBench match',
                                                      'records': rows}, indent=2) + '\n')
print(json.dumps({'tasks': len(rows), 'generated': sum(r['status'] == 'generated' for r in rows),
                  'patterns': sum(r.get('patterns',0) for r in rows),
                  'effect_variants': sum(r.get('effect_variants',0) for r in rows)}, indent=2))
