"""Execute compiled pooling fixtures on CUDA against native PyTorch pooling."""
import argparse,json
from pathlib import Path
import torch
from runtime import TorchProgram

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--fixtures',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    manifest=json.loads((args.fixtures/'manifest.json').read_text());records=[]
    dtypes={'f32':torch.float32,'f16':torch.float16,'bf16':torch.bfloat16}
    for row in manifest['records']:
        result={'index':row['index'],'dtype':row['dtype']}
        program=None
        try:
            x=torch.tensor(row['input']['data'],device='cuda',dtype=dtypes[row['dtype']]).reshape(row['input']['shape'])
            original=x.clone();expected=torch.nn.functional.avg_pool2d(x,**row['options'])
            program=TorchProgram(args.fixtures/row['artifact'],include_paths=['/usr/local/cuda/include']);actual=program(x)['out']
            torch.testing.assert_close(x,original,rtol=0,atol=0)
            torch.testing.assert_close(actual,expected,rtol=1.3e-6 if row['dtype']=='f32' else 0,atol=1e-5 if row['dtype']=='f32' else 0)
            torch.cuda.synchronize();result.update(status='passed',max_abs_error=(actual-expected).abs().max().item())
        except Exception as e:result.update(status='failed',error=str(e))
        finally:
            if program:program.close()
        records.append(result)
        args.output.write_text(json.dumps({'source_revision':manifest['source_revision'],'torch_version':torch.__version__,'gpu':torch.cuda.get_device_name(),'records':records},indent=2)+'\n')
        print(result,flush=True)
    if any(r['status']!='passed' for r in records):raise SystemExit(1)
if __name__=='__main__':main()
