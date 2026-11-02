#!/usr/bin/env python3
"""Retain pinned primary-source evidence for the native JSON action protocol."""
import hashlib
import json
from pathlib import Path
import tarfile

ticket=Path(__file__).resolve().parent.parent
archive_path=ticket/'sources/agent-runtime-bootstrap-v1/llama.cpp-source.tar.gz'
output=ticket/'sources/native-json-action-source-study-v1';output.mkdir()
names=['tools/server/server-common.cpp','tools/server/README.md','tests/test-json-schema-to-grammar.cpp']
records=[]
with tarfile.open(archive_path) as archive:
    for name in names:
        member=next(m for m in archive.getmembers() if m.name.endswith('/'+name))
        raw=archive.extractfile(member).read()
        destination=output/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)
        records.append({'archive_member':member.name,'path':name,'sha256':hashlib.sha256(raw).hexdigest()})
result={'format':'kiln-pinned-api-source-study/1','source_revision':'0ec4027a2a0183de87c007069adddc06e665f7de',
        'archive_sha256':hashlib.sha256(archive_path.read_bytes()).hexdigest(),'files':records,
        'findings':['server-common.cpp extracts response_format.json_schema.schema when type=json_schema.',
                    'The extracted schema becomes common_chat_templates_inputs.json_schema.',
                    'Use the executable source contract rather than the README shorthand showing a top-level schema.',
                    'No llama.cpp implementation is ported; this study informs the HTTP request shape.'],
        'pending':'Actual constrained decoding with the pinned Qwen model must be tested separately.'}
(output/'study.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
