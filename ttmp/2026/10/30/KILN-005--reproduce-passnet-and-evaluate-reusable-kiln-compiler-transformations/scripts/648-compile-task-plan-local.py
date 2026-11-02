"""Export, locally compile and archive every variant in a frozen task plan."""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
sources = ticket / 'sources'
sys.path.insert(0, str(repo / 'integrations/passnet'))
from corpus import export_task, compile_task

parser = argparse.ArgumentParser()
parser.add_argument('--name', required=True)
parser.add_argument('--plan', required=True, type=Path)
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', args.name):
    parser.error('--name must be a simple lowercase slug')
plan_path = (ticket / args.plan).resolve()
if not plan_path.is_relative_to(ticket) or not plan_path.is_file():
    parser.error('--plan must name an existing ticket file')
plan = json.loads(plan_path.read_text())
if plan.get('format') != 'kiln-task-plan/1' or not plan.get('tasks'):
    parser.error('nonempty kiln-task-plan/1 required')
output = sources / args.name
archive = sources / (args.name + '.tar.gz')
archive_receipt = sources / (args.name + '-archive.json')
if output.exists() or archive.exists() or archive_receipt.exists():
    parser.error('preserve prior compilation evidence; choose a new name')
output.mkdir()
records = []
for task in plan['tasks']:
    directory = output / f"task-{task['index']:03d}" / 'corpus'
    row = {'index': task['index'], 'graphs': task['graphs'],
           'directory': str(directory.relative_to(output))}
    try:
        export_task(sources / 'upstream', task['sample'], directory)
        compile_task(directory, repo, plan['target'], contraction=plan['contraction'],
                     skip_internal_reference_check=plan['skip_internal_reference_check'])
        row['status'] = 'compiled'
    except (Exception, SystemExit) as error:
        row['status'] = 'failed'
        row['error'] = str(error)
    records.append(row)
    (output / 'receipt.json').write_text(json.dumps({'format': 'kiln-task-plan-local-compile/1',
                                                      'plan_sha256': hashlib.sha256(plan_path.read_bytes()).hexdigest(),
                                                      'scope': 'Local source export and compiler only; no PassBench acceptance',
                                                      'records': records}, indent=2) + '\n')
subprocess.run(['tar', '-czf', str(archive), '-C', str(sources), output.name], check=True)
receipt = {'format': 'kiln-local-compile-archive/1', 'file': archive.name,
           'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
           'bytes': archive.stat().st_size,
           'tasks': len(records), 'graphs': sum(row['graphs'] for row in records),
           'compiled_tasks': sum(row['status'] == 'compiled' for row in records)}
archive_receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
