# perf-lab-cpu: the CPU environment of perf-lab-sampler/1 (Perf Lab's local sampler workload). PyTorch's CPU build,
# NumPy, and a C++ compiler for TorchInductor's generated code. The workload's sources are not in the image: each
# job stages them (packages/exec/src/kinds/perf-lab-sampler.ts), so the image changes only with its toolchain.
#
#   docker build -t perf-lab-cpu:latest runner/docker/perf-lab-cpu
#
# The versions are lab-workbench/workloads/pyproject.toml's, so runs here and Perf Lab's own runs share a toolchain.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ \
 && rm -rf /var/lib/apt/lists/*

ARG TORCH=2.14.1
ARG NUMPY=2.5.4
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple \
      "torch==${TORCH}" "numpy==${NUMPY}"

LABEL org.opencontainers.image.title="perf-lab-cpu" \
      org.opencontainers.image.description="CPU environment for Kiln's perf-lab-sampler/1 workload kind"
CMD ["python3", "-c", "import torch, numpy; print(torch.__version__, numpy.__version__)"]
