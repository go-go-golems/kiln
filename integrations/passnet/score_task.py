"""Invoke the unchanged scorer with its required validation curve filename."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def score(log, output, sample_id, upstream):
    log, output = log.resolve(), output.resolve()
    if output.exists():
        raise ValueError('Preserve earlier scores; choose a new output')
    validation = output.parent / (output.stem + '-input') / 'validation.log'
    validation.parent.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(log, validation)
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    if digest(log) != digest(validation):
        raise ValueError('Scoring input bytes changed')
    command = [sys.executable, '-m', 'pass_bench.aggregate_es_scores',
               '--benchmark-path', str(validation), '--sample-id', str(sample_id),
               '--disable-aggregation-mode', '--negative-speedup-penalty', '0',
               '--fpdb', '0.1', '--output-json-file-path', str(output)]
    result = subprocess.run(command, cwd=upstream)
    receipt = {'format': 'kiln-original-score-invocation/1', 'log_sha256': digest(validation),
               'command': command, 'returncode': result.returncode,
               'sample_id': sample_id, 'score_sha256': digest(output) if output.exists() else None}
    output.with_suffix('.receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    if result.returncode:
        return result.returncode
    value = json.loads(output.read_text())
    if value['id'] != sample_id:
        raise ValueError('Scorer returned a different sample identity')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('log', 'output', 'upstream'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--sample-id', type=int, required=True)
    args = parser.parse_args()
    raise SystemExit(score(args.log, args.output, args.sample_id, args.upstream))


if __name__ == '__main__':
    main()
