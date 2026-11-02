"""Trusted proposal-phase tools for a Kiln-native agent or search baseline.

This task has no shell/file-editor tool and never accepts evaluator paths from a
proposal. The caller owns inference, compilation, GPU measurement and selection.
The first experiment batches proposals so a local model can be unloaded before
timing. Proposal acceptance means grammar validity, not compiler correctness.
"""
import copy
import hashlib
import json
from pathlib import Path
import subprocess

from propose_policy import _training_evidence


FEATURES = ('originalWork', 'fusedWork', 'consumerCount', 'producerElements')
MAX_PROPOSAL_BYTES = 16384


def training_view(manifest, receipt):
    """Project approved training features; never forward arbitrary receipt text."""
    _, rows, _ = _training_evidence(manifest, receipt)
    if receipt.get('phase') != 'train':
        raise ValueError('Native agent requires a training-only compilation receipt')
    numerical = manifest.get('numerical_policy')
    if numerical not in ({'contraction': 'allow'}, {'contraction': 'separate'}):
        raise ValueError('Explicit host numerical policy required')
    if receipt.get('numerical_policy') != numerical:
        raise ValueError('Training numerical policy mismatch')
    examples = []
    for i, row in enumerate(rows):
        # No model/family names, paths, error strings or held-out rows are exposed.
        decisions = [{key: decision[key] for key in FEATURES} for decision in row['decisions']]
        examples.append({'example': i, 'decisions': decisions})
    return {'format': 'kiln-native-training-view/1',
            'numerical_policy': copy.deepcopy(numerical), 'examples': examples}


def _write_new(path, value):
    with path.open('x') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write('\n')


def _strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key: ' + key)
            result[key] = value
        return result
    def invalid_constant(value):
        raise ValueError('Nonfinite JSON number: ' + value)
    return json.loads(text, object_pairs_hook=pairs, parse_constant=invalid_constant)


class NativePolicyTask:
    """Single-owner, fresh-run proposal ledger; does not resume partial runs.

    The output directory is evaluator-owned. Reserve an attempt on disk before
    validation so a validator failure cannot silently restore the search budget.
    Only submit_policy consumes proposal slots; unknown tools consume agent steps
    in the caller. Identical policy programs still consume proposal slots.
    """
    def __init__(self, output, manifest, receipt, *, proposal_budget, node='node'):
        if type(proposal_budget) is not int or not 1 <= proposal_budget <= 1000:
            raise ValueError('Proposal budget must be an integer in [1,1000]')
        self._view = training_view(manifest, receipt)
        self._budget = proposal_budget
        self._attempts = 0
        self._seen = {}
        self._closed = False
        self._node = str(node)
        self._validator = Path(__file__).with_name('optimization_artifact.mjs')
        self._output = Path(output)
        self._output.mkdir(parents=True, exist_ok=False)
        _write_new(self._output/'task.json', {
            'format': 'kiln-native-policy-task/1', 'proposal_budget': proposal_budget,
            'corpus_membership_sha256': manifest['membership_sha256'],
            'training_view': self._view,
            'validator_sha256': hashlib.sha256(self._validator.read_bytes()).hexdigest(),
            'evaluation_status': 'not_run',
        })

    def inspect_training(self):
        return copy.deepcopy(self._view)

    def submit_policy(self, policy_json):
        if self._closed:
            return {'status': 'closed', 'attempts': self._attempts}
        if self._attempts >= self._budget:
            return {'status': 'budget_exhausted', 'attempts': self._attempts}
        self._attempts += 1
        attempt = self._attempts
        prefix = self._output/f'attempt-{attempt:04d}'
        request = {'attempt': attempt, 'status': 'reserved'}
        if isinstance(policy_json, str):
            data = policy_json.encode('utf-8', errors='surrogatepass')
            request.update(request_sha256=hashlib.sha256(data).hexdigest(), request_bytes=len(data))
            if len(data) <= MAX_PROPOSAL_BYTES:
                request['policy_json'] = policy_json
        _write_new(prefix.with_suffix('.request.json'), request)
        result = {'attempt': attempt, 'remaining': self._budget-attempt}
        try:
            if not isinstance(policy_json, str) or len(data) > MAX_PROPOSAL_BYTES:
                raise ValueError('policy_json must be a string of at most 16384 UTF-8 bytes')
            policy = _strict_json(policy_json)
            # JSON numeric exponents can overflow even without a NaN literal.
            payload = json.dumps({'policy': policy, 'numerical_policy': self._view['numerical_policy']}, allow_nan=False)
        except (ValueError, TypeError, RecursionError) as error:
            result.update(status='rejected', error=str(error))
        else:
            try:
                completed = subprocess.run([self._node, str(self._validator)], input=payload,
                                           text=True, capture_output=True, timeout=30)
                validation = _strict_json(completed.stdout)
                if completed.returncode == 2 and validation.get('status') == 'invalid':
                    result.update(status='rejected', error=validation['error'])
                elif completed.returncode == 0 and validation.get('status') == 'valid':
                    digest = validation['artifact_sha256']
                    result.update(status='accepted', artifact_sha256=digest,
                                  evaluation_status='not_run')
                    if digest in self._seen:
                        result.update(status='duplicate', duplicate_of=self._seen[digest])
                    else:
                        _write_new(prefix.with_suffix('.artifact.json'), validation['artifact'])
                        self._seen[digest] = attempt
                else:
                    raise RuntimeError('Unexpected validator result')
            except (OSError, subprocess.SubprocessError, ValueError, KeyError, RuntimeError) as error:
                result.update(status='infrastructure_error', error=str(error))
        _write_new(prefix.with_suffix('.result.json'), result)
        return result

    def finish(self):
        result = {'status': 'finished', 'attempts': self._attempts,
                  'unique_artifacts': len(self._seen), 'evaluation_status': 'not_run'}
        if not self._closed:
            _write_new(self._output/'finished.json', result)
            self._closed = True
        return result

    def call(self, name, parameters):
        """Narrow dispatch shared by a native agent driver and baseline search."""
        if name == 'submit_policy':
            # Invalid submission arguments also consume a proposal slot.
            return self.submit_policy(parameters.get('policy_json') if isinstance(parameters, dict) and set(parameters) == {'policy_json'} else None)
        if not isinstance(parameters, dict):
            return {'status': 'invalid_tool_arguments'}
        if name == 'inspect_training' and not parameters:
            return self.inspect_training()
        if name == 'finish' and not parameters:
            return self.finish()
        return {'status': 'unknown_tool_or_arguments'}
