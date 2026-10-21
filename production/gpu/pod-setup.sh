#!/bin/bash
# On the GPU pod (Ubuntu, NVIDIA driver from the host): Blender's runtime libraries and Blender itself (the current
# 4.5 LTS release for Linux, from blender.org) under /workspace/blender. Nothing else is installed.
#   bash pod-setup.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 libgl1 libegl1 libglu1-mesa xz-utils curl >/dev/null
cd /workspace
if [ ! -x blender/blender ]; then
  ver=$(curl -s https://download.blender.org/release/Blender4.5/ | grep -o 'blender-4\.5\.[0-9]*-linux-x64\.tar\.xz' | sort -V | tail -1)
  echo "downloading $ver"
  curl -s -L -o blender.tar.xz "https://download.blender.org/release/Blender4.5/$ver"
  mkdir -p blender && tar -xf blender.tar.xz -C blender --strip-components=1 && rm blender.tar.xz
fi
blender/blender --version | head -1
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
