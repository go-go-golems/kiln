from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/fifth-task',include_paths=['/usr/local/cuda/include'])
def kiln_concat_mean(x,y,stop):
 return DISPATCH(x,y,specialization=(stop,))
