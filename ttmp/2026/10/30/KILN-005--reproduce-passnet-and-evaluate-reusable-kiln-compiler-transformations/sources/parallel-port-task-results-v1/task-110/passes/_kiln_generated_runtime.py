from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/results/task-110/corpus',include_paths=['/usr/local/cuda/include'])
SINGLETONS=[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
def kiln_generated(*args):
 inputs,identity=args[:-1],args[-1]
 result=DISPATCH(*inputs,specialization=(identity,))
 return result[0] if identity in SINGLETONS else result
