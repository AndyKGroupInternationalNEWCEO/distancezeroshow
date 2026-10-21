#!/bin/bash
# Renders the reflection probes on a RunPod GPU pod and fetches them: uploads production/gpu (scripts + the exported
# scenes in cache/ and cache-up/), installs Blender there once (pod-setup.sh), runs probes.py for each scene, copies
# the .f16 probes to assets/probes/ and the looks to production/gpu/out/. The pod is started and stopped by hand
# (RunPod console or MCP); this script only uses its SSH address.
#   production/gpu/run-on-pod.sh <host> <port> [cache cache-up]
set -euo pipefail
HOST=$1 PORT=$2; shift 2
CACHES=("${@:-cache cache-up}")
[ $# -eq 0 ] && CACHES=(cache cache-up)
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
SSH=(-i "$HOME/.ssh/dz_runpod_ed25519" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
ssh "${SSH[@]}" -p "$PORT" "root@$HOST" 'mkdir -p /workspace/dz'
scp "${SSH[@]}" -P "$PORT" "$HERE/probes.py" "$HERE/pod-setup.sh" "root@$HOST:/workspace/dz/"
for c in "${CACHES[@]}"; do scp -r "${SSH[@]}" -P "$PORT" "$HERE/$c" "root@$HOST:/workspace/dz/"; done
ssh "${SSH[@]}" -p "$PORT" "root@$HOST" 'bash /workspace/dz/pod-setup.sh' | tail -2
for c in "${CACHES[@]}"; do
  ssh "${SSH[@]}" -p "$PORT" "root@$HOST" "cd /workspace/dz && s=\$(date +%s); DZ_CACHE=$c DZ_SAMPLES=\${DZ_SAMPLES:-1024} /workspace/blender/blender -b -P probes.py > $c.log 2>&1; echo \"$c: \$(( \$(date +%s) - s )) s\"; grep -E 'probe |Error|Traceback' $c.log | tail -5"
  mkdir -p "$HERE/out"; scp "${SSH[@]}" -P "$PORT" "root@$HOST:/workspace/dz/$c/probe-*" "$HERE/out/"
done
for f in "$HERE"/out/probe-*.f16; do n=$(basename "$f" .f16); cp "$f" "$ROOT/assets/probes/dj-${n#probe-}.f16"; done
ls -la "$ROOT/assets/probes"
