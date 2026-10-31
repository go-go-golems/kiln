#!/usr/bin/env python3
"""Materialize verified UTF-8 file records without executing corpus code."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import pyarrow.parquet as pq

parser = argparse.ArgumentParser()
parser.add_argument('--sources', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = args.output.resolve()
root.mkdir(parents=True, exist_ok=True)
receipt = json.loads((args.sources / 'dataset-download-receipt.json').read_text())
if len(receipt) != 14:
    raise ValueError('Full corpus requires 14 verified shards')
count = duplicates = 0
with (root / 'materialization-manifest.jsonl').open('w') as manifest:
    for shard in receipt:
        path = args.sources / 'dataset' / shard['file']
        with path.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != shard['sha256']:
                raise ValueError(f'Shard hash mismatch: {path}')
        for batch in pq.ParquetFile(path).iter_batches(batch_size=512):
            for row in batch.to_pylist():
                name = PurePosixPath(row['path'])
                if name.is_absolute() or '..' in name.parts or '\\' in row['path'] or not name.parts:
                    raise ValueError(f'Unsafe record path: {name}')
                target = root.joinpath(*name.parts)
                if not target.resolve().is_relative_to(root):
                    raise ValueError(f'Escaping record path: {name}')
                data = row['content'].encode('utf-8')
                digest = hashlib.sha256(data).hexdigest()
                if target.exists():
                    if target.read_bytes() != data:
                        raise ValueError(f'Conflicting duplicate: {name}')
                    duplicates += 1
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                manifest.write(json.dumps({'path':str(name), 'sha256':digest, 'bytes':len(data), 'source_folder':row['source_folder'], 'shard':shard['file']})+'\n')
                count += 1
        print(f'{shard["file"]}: {count} records, {duplicates} identical duplicates', flush=True)
(root / 'materialization-receipt.json').write_text(json.dumps({'records':count,'duplicates':duplicates,'shards':receipt}, indent=2)+'\n')
