"""Owned NDJSON transport for NativePolicyTask; stdout contains responses only.

The caller assigns unique request IDs and serializes requests. Invalid tool
arguments reach the trusted task unchanged, preserving submission accounting.
Transport failures terminate the process; they are never retried implicitly.
"""
import argparse
import json
import sys

from native_policy_task import NativePolicyTask, _strict_json


def serve(task, incoming, outgoing):
    seen = set()
    def emit(value):
        outgoing.write(json.dumps(value, allow_nan=False) + '\n')
        outgoing.flush()
    emit({'format': 'kiln-native-policy-rpc/1', 'status': 'ready'})
    try:
        for line in incoming:
            request = _strict_json(line)
            if not isinstance(request, dict) or set(request) != {'id', 'tool', 'arguments'}:
                raise ValueError('Expected id, tool and arguments')
            ident = request['id']
            if not isinstance(ident, str) or not ident or ident in seen:
                raise ValueError('Request ID must be a unique nonempty string')
            if not isinstance(request['tool'], str):
                raise ValueError('Tool name must be a string')
            seen.add(ident)
            result = task.call(request['tool'], request['arguments'])
            emit({'id': ident, 'result': result})
    finally:
        task.finish()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--proposal-budget', required=True, type=int)
    parser.add_argument('--node', required=True)
    args = parser.parse_args()
    with open(args.manifest) as stream:
        manifest = _strict_json(stream.read())
    with open(args.receipt) as stream:
        receipt = _strict_json(stream.read())
    task = NativePolicyTask(args.output, manifest, receipt,
                            proposal_budget=args.proposal_budget, node=args.node)
    serve(task, sys.stdin, sys.stdout)


if __name__ == '__main__':
    main()
