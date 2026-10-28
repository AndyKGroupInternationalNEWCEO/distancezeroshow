#!/bin/bash
# The notes of DJ Andy'K's piano arrangements (step 1 of virtual-studio/vienna/arrangements-import.mjs). For each song
# folder of the sheet-music batch: a small copy (no PDFs, HTML or images: the batch's own files are never touched),
# score-parts.py on it (it rebuilds the score and checks it comes out identical), its notes kept, the copy removed.
# Light (about a second a song, no GPU). Needs python3 with numpy.
#   PY=/path/to/python production/gpu/arrangement-notes.sh <out-dir> [djandyk-landing]
set -euo pipefail
OUT=$1; LIB=${2:-$HOME/djandyk-landing}; PY=${PY:-python3}
B=$LIB/piano-reference/sheet-music/batch; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"; W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
for d in $(ls "$B/work2"); do
  rm -rf "$W"/*; mkdir -p "$W/work2/$d"
  cp "$B/sheet.py" "$B/stages.py" "$B/chordarr.py" "$B/tracks.json" "$HERE/score-parts.py" "$W/"
  rsync -a --exclude '*.pdf' --exclude '*.html' --exclude '*.jpg' --exclude '*.png' "$B/work2/$d/" "$W/work2/$d/"
  (cd "$W" && "$PY" score-parts.py | tail -1 && mv score-notes.json "$OUT/$d.json")
done
