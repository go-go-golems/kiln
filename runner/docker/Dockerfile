# syntax=docker/dockerfile:1
# kiln-perf: Kiln's CUDA runner and launcher with only what they need — nvcc, NVRTC, the CUDA runtime, NumPy — plus a
# device probe and the launcher's round-trip fixtures. build.sh assembles the build context; see README.md.
ARG UBUNTU=24.04
FROM ubuntu:${UBUNTU}

ARG TARGETARCH
ARG CUDA_VERSION=13.0
# 1 adds Nsight Compute (ncu) for the runner's --ncu profiling; it is most of the image's size
ARG WITH_NCU=0

RUN set -eux; \
    case "$TARGETARCH" in arm64) repo=sbsa ;; amd64) repo=x86_64 ;; *) echo "unsupported architecture $TARGETARCH" >&2; exit 1 ;; esac; \
    v=$(echo "$CUDA_VERSION" | tr . -); \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSLo /tmp/cuda-keyring.deb "https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/$repo/cuda-keyring_1.1-1_all.deb"; \
    dpkg -i /tmp/cuda-keyring.deb; \
    rm /tmp/cuda-keyring.deb; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        "cuda-nvcc-$v" "cuda-cudart-dev-$v" "cuda-nvrtc-dev-$v" g++ python3 python3-numpy \
        $(if [ "$WITH_NCU" = 1 ]; then echo "cuda-nsight-compute-$v"; fi); \
    apt-get purge -y curl; \
    apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*; \
    ln -sfn "/usr/local/cuda-$CUDA_VERSION" /usr/local/cuda

ENV PATH=/usr/local/cuda/bin:$PATH \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    KILN_CACHE=/tmp/kiln-runner-cache

COPY --chown=0:0 kiln_runner.py kiln_launch.py kiln-probe.cu /opt/kiln/
COPY --chown=0:0 fixtures/ /opt/kiln/fixtures/
COPY --chown=0:0 --chmod=755 kiln-probe kiln-selftest /usr/local/bin/

ARG KILN_REVISION=unknown
ARG RUNNER_SHA256=unknown
ARG LAUNCHER_SHA256=unknown
LABEL org.opencontainers.image.title="kiln-perf" \
      org.opencontainers.image.description="Kiln CUDA runner, launcher, device probe and fixtures" \
      org.opencontainers.image.revision="$KILN_REVISION" \
      kiln.cuda="$CUDA_VERSION" \
      kiln.runner.sha256="$RUNNER_SHA256" \
      kiln.launcher.sha256="$LAUNCHER_SHA256"

WORKDIR /tmp
CMD ["kiln-selftest"]
