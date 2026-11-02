#!/usr/bin/env python3
"""Collect one terminal staged PassBench run from bling and audit every declared graph.

Generalizes 655 to any staged study: the run directory, its frozen plan and the staging receipt
must agree (complete status, identical plan, identical source snapshot). Writes <name>/,
<name>-audit.json, <name>-raw.tar.gz and <name>-collection.json beside the staging receipt.

usage: 669-collect-task-plan-run.py --study sources/p0-replay-gpu-v1 --plan sources/p0-replay-v1/plan.json --run results --name results
"""
import argparse, hashlib, json, subprocess
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
RSH = 'ssh -o HostKeyAlias=bling.local'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--study', required=True, type=Path, help='local study directory holding staging.json, relative to ticket')
    p.add_argument('--plan', required=True, type=Path, help='frozen plan, relative to ticket')
    p.add_argument('--run', required=True, help='remote run directory name under the staged root')
    p.add_argument('--name', required=True, help='local name for the collected run')
    a = p.parse_args()
    study = TICKET / a.study
    staging = json.loads((study / 'staging.json').read_text())
    destination, audit = study / a.name, study / f'{a.name}-audit.json'
    archive, receipt = study / f'{a.name}-raw.tar.gz', study / f'{a.name}-collection.json'
    if any(x.exists() for x in (destination, audit, archive, receipt)):
        p.error('collection already exists; preserve prior evidence')
    subprocess.run(['rsync', '-a', '-e', RSH, f"manuel@bling:{staging['remote']}/{a.run}/", str(destination) + '/'], check=True)
    run = json.loads((destination / 'run.json').read_text())
    plan = json.loads((TICKET / a.plan).read_text())
    if run['status'] != 'complete' or run['plan'] != plan:
        raise RuntimeError('collected run is incomplete or differs from the frozen plan')
    if run['source_snapshot']['sha256'] != staging['source_snapshot']['sha256']:
        raise RuntimeError('collected run source snapshot differs from staging')
    subprocess.run(['python3', 'integrations/passnet/summarize_task_run.py', '--directory', str(destination),
                    '--upstream', str(TICKET / 'sources/upstream'), '--output', str(audit)], check=True)
    result = json.loads(audit.read_text())
    if result['tasks_expected'] != len(plan['tasks']) or result['graphs_expected'] != sum(t['graphs'] for t in plan['tasks']):
        raise RuntimeError('auditor membership disagrees with the frozen plan')
    subprocess.run(['tar', '-czf', str(archive), '-C', str(study), a.name], check=True)
    record = {'format': 'kiln-task-run-collection/1', 'study': str(a.study), 'run': a.run,
              'source_revision': staging['source_revision'], 'source_snapshot_sha256': run['source_snapshot']['sha256'],
              'plan_sha256': hashlib.sha256((TICKET / a.plan).read_bytes()).hexdigest(),
              **{k: result[k] for k in ['tasks_expected', 'graphs_expected', 'tasks_nominal_accepted', 'graphs_nominal_accepted', 'unexecuted_graphs']},
              'audit_sha256': hashlib.sha256(audit.read_bytes()).hexdigest(), 'archive': archive.name,
              'archive_bytes': archive.stat().st_size, 'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
    receipt.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    main()
