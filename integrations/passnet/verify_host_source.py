"""Compare a remote measurement host's source bytes with a compilation checkpoint."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint',type=Path,required=True)
    parser.add_argument('--host',required=True)
    parser.add_argument('--kiln',type=Path,required=True,help='Absolute remote compiler root')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.output.exists():raise ValueError('Preserve previous source verification')
    code='from pathlib import Path; from evaluate_tasks import snapshot; import json; print(json.dumps(snapshot(Path('+repr(str(args.kiln))+'))))'
    command='cd '+shlex.quote(str(args.kiln/'integrations/passnet'))+' && python3 -c '+shlex.quote(code)
    observed=json.loads(subprocess.check_output(['ssh',args.host,command],text=True))
    expected=json.loads(args.checkpoint.read_text())['source_snapshot']
    result={'expected_snapshot':expected['sha256'],'observed_snapshot':observed['sha256'],'matches':observed==expected,'observed':observed}
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print('REMOTE SOURCE MATCH',result['matches'],result['observed_snapshot'])
    if not result['matches']:raise SystemExit(1)


if __name__=='__main__':main()
