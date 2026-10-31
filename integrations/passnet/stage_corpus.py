"""Stage exact manifest source directories with rsync, preserving relative paths."""
import argparse
from pathlib import Path
import subprocess
from corpus import read_manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',type=Path,required=True)
    parser.add_argument('--upstream',type=Path,required=True)
    parser.add_argument('--destination',required=True,help='rsync destination root, such as host:/absolute/upstream/')
    args=parser.parse_args()
    manifest=read_manifest(args.corpus)
    for row in manifest['variants']:
        source=args.upstream/row['graph']
        for name in ['model.py','input_meta.py','weight_meta.py']:
            if not (source/name).is_file():raise ValueError(f'Missing source file: {source/name}')
        subprocess.run(['rsync','-aR',str(args.upstream.resolve())+'/./'+row['graph']+'/',args.destination],check=True)
    print('Staged',len(manifest['variants']),'source directories')


if __name__=='__main__':main()
