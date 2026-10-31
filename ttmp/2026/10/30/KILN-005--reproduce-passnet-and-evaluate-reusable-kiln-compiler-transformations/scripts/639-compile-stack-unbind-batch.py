"""Export and locally compile every graph in the new stack/unbind families."""

import json
import sys
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
sources = ticket / 'sources'
output = sources / 'stack-unbind-batch-local-compile-v1'
assert not output.exists(), 'Preserve prior compilation artifacts'
output.mkdir()
sys.path.insert(0, str(repo / 'integrations/passnet'))
from corpus import export_task, compile_task

plan = json.loads((sources / 'stack-unbind-batch-task-plan-v1.json').read_text())
records = []
for task in plan['tasks']:
    directory = output / f"task-{task['index']:03d}" / 'corpus'
    row = {'index': task['index'], 'graphs': task['graphs'], 'directory': str(directory.relative_to(output))}
    try:
        export_task(sources / 'upstream', task['sample'], directory)
        compile_task(directory, repo, 'a100', contraction='separate', skip_internal_reference_check=True)
        row['status'] = 'compiled'
    except (Exception, SystemExit) as error:
        row['status'] = 'failed'
        row['error'] = str(error)
    records.append(row)
    (output / 'receipt.json').write_text(json.dumps({'format': 'kiln-stack-unbind-local-compile/1',
                                                      'scope': 'CPU compilation only; no PassBench acceptance',
                                                      'records': records}, indent=2) + '\n')
print(json.dumps({'tasks': len(records), 'compiled': sum(row['status'] == 'compiled' for row in records),
                  'graphs': sum(row['graphs'] for row in records)}, indent=2))
