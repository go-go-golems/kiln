"""Run kiln_launch check_fixtures on CUDA with the toolkit include directory passed to NVRTC
(the check subcommand has no include-path option)."""
import sys, functools
sys.path.insert(0, "runtime/python")
import kiln_launch as kl
inc = sys.argv[2]
kl.CudaProgram = functools.partial(kl.CudaProgram, include_paths=(inc,))
sys.exit(1 if kl.check_fixtures(sys.argv[1], "cuda") else 0)
