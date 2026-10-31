from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/matrix-cohort-v1/task-118/corpus',include_paths=['/usr/local/cuda/include'])
SINGLETONS=[0, 1, 2, 3, 4]
def kiln_generated(*args):
 inputs,identity=args[:-1],args[-1]
 result=DISPATCH(*inputs,specialization=(identity,))
 return result[0] if identity in SINGLETONS else result
