#!/bin/sh
# The two videos the arrival cut (?cut=arrival) plays on the LED wall, as frame sequences, so every rendered frame
# shows exactly the right picture: the opening (the same as in the on-air simulation) and the studio background loop.
#   sh production/empty-opening/frames.sh   ->  out/frames/intro/0001.jpg …, out/frames/bg/0001.jpg …, out/frames/count.json
set -eu
cd "$(dirname "$0")"
# the background loop from the show's master (1920 × 1080, Real-ESRGAN upscale of 15 Oct 2026; same 121 frames)
for pair in "intro ../../../shared-assets/show\ DO/ligobidhjvj.mp4" "bg ../../../shared-assets/show\ DO/DZ\ -\ MASTER\ STUDIO.mov"; do
  set -- $pair
  rm -rf "out/frames/$1"; mkdir -p "out/frames/$1"
  ffmpeg -v error -y -i "$2" -q:v 2 "out/frames/$1/%04d.jpg"
done
# the background loop made seamless: its last second dissolves into its start (bg-loop, 97 frames)
../avatars/.venv/bin/python - <<'EOP'
from PIL import Image
import os
L, K = 121, 24
os.makedirs('out/frames/bg-loop', exist_ok=True)
src = [Image.open(f'out/frames/bg/{i+1:04d}.jpg').convert('RGB') for i in range(L)]
for j in range(L - K):
    (Image.blend(src[L - K + j], src[j], (j + 0.5) / K) if j < K else src[j]).save(f'out/frames/bg-loop/{j+1:04d}.jpg', quality=95)
EOP
printf '{"fps":24,"intro":%s,"bg":%s}\n' "$(ls out/frames/intro | wc -l | tr -d ' ')" "$(ls out/frames/bg-loop | wc -l | tr -d ' ')" > out/frames/count.json
cat out/frames/count.json
