#!/bin/sh
# Web versions of the show's wall videos and jingles for the on-air simulation.
#   sh virtualspace/show-media.sh "<folder with the show videos>" "<folder with the jingle masters>"
# Videos: 4K masters -> 1920x1080 H.264 (the LED wall is 2048 px wide on desktops), silent, fast start.
# Jingles: 48 kHz WAV masters -> AAC 256 kbit/s.
# Output: assets/show/*.mp4 and assets/jingles/*.m4a (named in onair.js, copied by build.mjs).
set -eu
cd "$(dirname "$0")/.."
VID="$1"; JIN="$2"
mkdir -p assets/show assets/jingles

slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -e "s/'//g" -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//'; }

for f in "$VID"/*.mp4; do
  name=$(slug "$(basename "$f" .mp4)")
  ffmpeg -v error -y -i "$f" -an -vf "scale=1920:1080:flags=lanczos,fps=24" -c:v libx264 -profile:v high -preset slow -crf 20 \
    -pix_fmt yuv420p -movflags +faststart "assets/show/$name.mp4"
  echo "video   $name"
done

for f in "$JIN"/*_master.wav; do
  base=$(basename "$f" _master.wav)
  num=$(printf '%s' "$base" | cut -c1-2)
  title=$(printf '%s' "$base" | sed -e 's/^[0-9]* *[^A-Za-z]* *//' -e 's/ *([^)]*)//g')
  name="$num-$(slug "$title")"
  ffmpeg -v error -y -i "$f" -c:a aac -b:a 256k -movflags +faststart "assets/jingles/$name.m4a"
  echo "jingle  $name"
done
