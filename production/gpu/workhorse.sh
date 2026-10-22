#!/bin/bash
# The RunPod pod as this project's workhorse, so the Mac stays free: the browser tests (headless Chrome on the pod)
# and the GPU renders run there. Syncs the worktree (with the git-ignored masters it needs), sets the pod up once,
# runs a command there.
#   production/gpu/workhorse.sh <host> <port> setup            (once per pod: Chrome, Node, rsync)
#   production/gpu/workhorse.sh <host> <port> sync             (the worktree → /workspace/dz)
#   production/gpu/workhorse.sh <host> <port> run '<command>'  (in /workspace/dz, with CHROME set)
set -euo pipefail
HOST=$1 PORT=$2 CMD=$3
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
SSH="ssh -i $HOME/.ssh/dz_runpod_ed25519 -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p $PORT"
case $CMD in
  setup) $SSH root@$HOST 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq rsync wget ca-certificates fonts-liberation >/dev/null
    [ -x /usr/bin/google-chrome ] || { wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt-get install -y -qq /tmp/chrome.deb >/dev/null; }
    command -v node >/dev/null && node -v | grep -q "^v2[2-9]" || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null; }
    google-chrome --version; node -v' ;;
  sync) rsync -az --delete -e "$SSH" --exclude .git --exclude node_modules --exclude test-output --exclude 'virtualspace/dist' --exclude 'production/gpu/cache*' --exclude 'production/gpu/out' --exclude 'production/blender/renders' "$ROOT/" root@$HOST:/workspace/dz/ ;;
  run) shift 3; $SSH root@$HOST "cd /workspace/dz && export CHROME=/usr/bin/google-chrome CHROME_ARGS='--no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader' && $*" ;;
esac
