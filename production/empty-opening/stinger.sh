#!/bin/sh
# The way through the LED wall into the live picture: an OBS stinger made from the opening's last frame (the clean
# logo card). It starts exactly as the opening ends, then pushes in through the // of the logo while it fades away,
# so the live cameras of Andy'K and Georgie appear through it. Transition point: 0 ms (the card already covers).
#   sh production/empty-opening/stinger.sh            -> out/stinger-through-logo.webm (VP9 + alpha) and .mov (ProRes 4444 + alpha)
#   out/stinger-preview.mp4: the same over a stand-in "live" picture, to look at
set -eu
cd "$(dirname "$0")"
CARD=out/still-89.00.png; LIVE="${1:-out/still-58.00.png}"; D=1.4
[ -f "$CARD" ] || node render.mjs --stills 89
# push in towards the slash of the logo (centre, 44 % down), accelerating; fade out from 0.35 s over 0.9 s
F="format=rgba,zoompan=z='1+5*pow(on/30/$D\\,2.2)':x='iw/2-iw/zoom/2':y='ih*0.44-ih/zoom/2':d=1:s=1920x1080:fps=30,fade=t=out:st=0.35:d=0.9:alpha=1,setsar=1"
ffmpeg -v error -y -loop 1 -framerate 30 -t $D -i "$CARD" -vf "$F" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 6M -auto-alt-ref 0 out/stinger-through-logo.webm
ffmpeg -v error -y -loop 1 -framerate 30 -t $D -i "$CARD" -vf "$F" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le out/stinger-through-logo.mov
ffmpeg -v error -y -loop 1 -framerate 30 -t $D -i "$LIVE" -c:v libvpx-vp9 -i out/stinger-through-logo.webm \
  -filter_complex "[0:v]scale=1920:1080,format=rgba[bg];[bg][1:v]overlay=0:0:shortest=1,format=yuv420p" -c:v libx264 -crf 18 -movflags +faststart out/stinger-preview.mp4
echo out/stinger-through-logo.webm out/stinger-through-logo.mov out/stinger-preview.mp4
