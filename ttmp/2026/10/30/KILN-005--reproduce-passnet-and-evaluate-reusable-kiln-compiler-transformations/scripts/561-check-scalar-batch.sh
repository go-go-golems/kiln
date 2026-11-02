#!/bin/sh
# Run from repository root. CPU oracle plus reference/decomposition and CUDA emission.
python3 -m unittest discover -s integrations/passnet -p test_fx_scalar_ops.py -v
