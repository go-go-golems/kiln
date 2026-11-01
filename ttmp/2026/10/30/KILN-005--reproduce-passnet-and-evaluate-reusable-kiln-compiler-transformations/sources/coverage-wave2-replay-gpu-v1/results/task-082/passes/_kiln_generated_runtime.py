from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/results/task-082/corpus',include_paths=['/usr/local/cuda/include'])
def kiln_generated(*args):
 inputs,identity=args[:-1],args[-1]
 return DISPATCH(*inputs,specialization=(identity,))
