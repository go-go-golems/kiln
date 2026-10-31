from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/sixth-task',include_paths=['/usr/local/cuda/include'])
def kiln_silu_mul(x,y):
 return DISPATCH(x,y)[0]
