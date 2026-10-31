#!/usr/bin/env python3
"""Replay seven complete tasks through original PassBench after --no-check export.

This is a diagnostic. It never changes the original task directories or the
ordinary coverage ledger. Run under `sg docker` on bling; use tmux for the job.
"""

import hashlib
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path


BASE = Path('/home/manuel/passnet-kiln/KILN-005/sources')
OUTPUT = BASE / 'seven-family-no-check-diagnostic-v1'
IMAGE = 'sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba'
GROUPS = [
    ('parallel-port-qualification-v1', [177, 188, 110, 36, 31]),
    ('parallel-port-delta-qualification-v1', [47, 146]),
]


def save(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command, log_path, cwd):
    started = time.monotonic()
    with log_path.open('w') as log:
        result = subprocess.run(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
    return {'command': list(map(str, command)), 'returncode': result.returncode,
            'elapsed_seconds': time.monotonic() - started}


def docker(root, source, command, *, gpu=False):
    return ['docker', 'run', '--rm', *(['--gpus', 'all'] if gpu else []),
            '-v', f'{root}:/work', '-v', f'{source / "kiln"}:/work/kiln:ro',
            '-v', f'{source / "upstream"}:/work/upstream:ro',
            '-w', '/work/kiln/integrations/passnet', '--entrypoint', 'python', IMAGE,
            *command]


def main():
    if OUTPUT.exists():
        raise SystemExit(f'Preserve existing diagnostic: {OUTPUT}')

    # The original run receipts pin two distinct compiler source snapshots.
    # Check the live trees before creating any diagnostic output.
    source_contexts = {}
    for source_name, indices in GROUPS:
        source = BASE / source_name
        sys.path.insert(0, str(source / 'kiln/integrations/passnet'))
        from evaluate_tasks import snapshot
        original = json.loads((source / 'results/run.json').read_text())
        actual = snapshot(source / 'kiln')
        if actual != original['source_snapshot']:
            raise RuntimeError(f'Compiler source changed since {source_name} qualification')
        records = {row['index']: row for row in original['records']}
        for index in indices:
            if index not in records or records[index].get('failed_phase') != 'compile':
                raise ValueError(f'Task {index} has no matching original compile failure')
        source_contexts[source_name] = (source, original, records)
        sys.path.pop(0)

    OUTPUT.mkdir(parents=True)
    (OUTPUT / 'results').mkdir()
    summary = {'format': 'kiln-reference-bypass-diagnostic/1',
               'scope': 'Seven complete tasks; Kiln export --no-check only; original PassBench evaluator unchanged; excluded from ordinary coverage ledger',
               'image_id': subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', IMAGE], text=True).strip(),
               'node_version': subprocess.check_output(['node', '--version'], text=True).strip(),
               'records': [], 'status': 'running'}
    save(OUTPUT / 'run.json', summary)

    for source_name, indices in GROUPS:
        source, original, records = source_contexts[source_name]
        for index in indices:
            print(f'START task {index}', flush=True)
            old_case = source / 'results' / f'task-{index:03d}'
            case = OUTPUT / 'results' / f'task-{index:03d}'
            shutil.copytree(old_case, case)
            old_receipt = case / 'corpus/compile-receipt.json'
            if old_receipt.exists():
                old_receipt.rename(case / 'corpus/original-compile-receipt.json')
            manifest = json.loads((case / 'corpus/manifest.json').read_text())
            expected = records[index]['graphs_expected']
            if len(manifest['variants']) != expected:
                raise ValueError(f'Task {index}: {len(manifest["variants"])} variants, expected {expected}')
            row = {'index': index, 'source_root': source_name, 'source_snapshot_sha256': original['source_snapshot']['sha256'],
                   'sample': records[index]['sample'], 'graphs_expected': expected,
                   'input_sha256': {r['script']: sha256(case / 'corpus' / r['script']) for r in manifest['variants']},
                   'status': 'compiling', 'compile': [], 'phases': []}
            summary['records'].append(row)
            save(OUTPUT / 'run.json', summary)
            for variant in manifest['variants']:
                script = case / 'corpus' / variant['script']
                artifact = script.with_suffix('.json')
                command = ['node', 'scripts/kiln-export.mjs', '--script', str(script),
                           '--target', 'a100', '--contraction', 'separate',
                           '--no-check', '--out', str(artifact)]
                result = run(command, script.with_suffix('.compile-no-check.log'), source / 'kiln')
                row['compile'].append({'graph': variant['graph'], 'artifact': artifact.name,
                                       'source_sha256': sha256(script), **result})
                save(OUTPUT / 'run.json', summary)
                print(f'  compile {script.name}: {result["returncode"]}', flush=True)
                if result['returncode']:
                    row['status'] = 'compile_failed'
                    break
            if row['status'] == 'compile_failed':
                save(OUTPUT / 'run.json', summary)
                continue

            mounted = f'/work/results/task-{index:03d}'
            row['status'] = 'evaluating'
            save(OUTPUT / 'run.json', summary)
            command = docker(OUTPUT, source,
                             ['run_task.py', '--directory', mounted + '/corpus',
                              '--upstream', '/work/upstream', '--pass-directory', mounted + '/passes',
                              '--log', mounted + '/benchmark.log', '--warmup', '20', '--trials', '100'], gpu=True)
            result = run(command, case / 'run-task.log', source / 'kiln')
            row['phases'].append({'phase': 'evaluate', **result})
            save(OUTPUT / 'run.json', summary)
            print(f'  evaluate: {result["returncode"]}', flush=True)
            if result['returncode']:
                row['status'] = 'evaluate_failed'
                save(OUTPUT / 'run.json', summary)
                continue

            row['status'] = 'scoring'
            save(OUTPUT / 'run.json', summary)
            command = docker(OUTPUT, source,
                             ['score_task.py', '--log', mounted + '/benchmark.log',
                              '--sample-id', str(index + 1), '--upstream', '/work/upstream',
                              '--output', mounted + '/score.json'])
            result = run(command, case / 'score.log', source / 'kiln')
            row['phases'].append({'phase': 'score', **result})
            row['status'] = 'process_complete' if result['returncode'] == 0 else 'score_failed'
            save(OUTPUT / 'run.json', summary)
            print(f'  score: {result["returncode"]}', flush=True)

    summary['status'] = 'complete'
    save(OUTPUT / 'run.json', summary)


if __name__ == '__main__':
    main()
