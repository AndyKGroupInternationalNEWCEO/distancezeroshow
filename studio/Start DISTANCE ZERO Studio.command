#!/bin/zsh
# Double-click to start the DISTANCE // ZERO studio and Georgie's link. Close this window (or Ctrl+C) to stop.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install --no-fund --no-audit
exec npm run --silent studio
