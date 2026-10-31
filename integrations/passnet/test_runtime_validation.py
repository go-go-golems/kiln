"""Validate artifact contracts before CUDA initialization."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'runtime/python'))
import unittest
from unittest.mock import patch
from runtime import TorchProgram

class ArtifactValidationTests(unittest.TestCase):
    def test_invalid_storage_rejected_before_cuda(self):
        for dtype,buffer_dtype,size in [('f16','f32',4),('bf16','bf16',1),('typo','typo',4)]:
            artifact={'format':'kiln-program/1','inputs':[{'name':'x','shape':[2],'buffer':0,'dtype':dtype}], 'outputs':[], 'buffers':[{'id':0,'dtype':buffer_dtype,'bytes':size}]}
            with patch('runtime.open_program') as loader:
                with self.assertRaises(ValueError): TorchProgram(artifact)
                loader.assert_not_called()

if __name__=='__main__': unittest.main()
