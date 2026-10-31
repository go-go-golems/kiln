from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/fourth-task-canonical',include_paths=['/usr/local/cuda/include'])
SINGLETONS=[]
def kiln_generated(*args):
 inputs,identity=args[:-1],args[-1]
 result=DISPATCH(*inputs,specialization=(identity,))
 return result[0] if identity in SINGLETONS else result
