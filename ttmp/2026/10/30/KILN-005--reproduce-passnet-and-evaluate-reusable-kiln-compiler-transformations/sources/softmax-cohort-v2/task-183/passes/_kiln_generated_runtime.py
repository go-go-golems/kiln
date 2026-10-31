from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/softmax-cohort-v2/task-183/corpus',include_paths=['/usr/local/cuda/include'])
SINGLETONS=[0, 1]
def kiln_generated(*args):
 inputs,identity=args[:-1],args[-1]
 result=DISPATCH(*inputs,specialization=(identity,))
 return result[0] if identity in SINGLETONS else result
