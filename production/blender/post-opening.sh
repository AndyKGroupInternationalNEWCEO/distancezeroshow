#!/bin/sh
# The Cycles opening from its 2700 frames: H.264 1080p30, the last 1.2 s dissolving into the clean D//0 card (as the
# real-time opening does, 87.3-88.5 s) and holding it to 90 s, then the official sound via empty-opening/mix.sh.
#   sh production/blender/post-opening.sh   ->  renders/opening-cycles-1080p30-audio.mp4
set -eu
cd "$(dirname "$0")"
F=renders/opening-frames; CARD=../empty-opening/out/still-89.00.png
n=$(find $F -name 'f*.png' -size +10k | wc -l | tr -d ' ')
[ "$n" -eq 2700 ] || { echo "frames: $n of 2700, not complete"; exit 1; }
ffmpeg -v error -y -framerate 30 -i $F/f%04d.png -loop 1 -framerate 30 -i $CARD -filter_complex \
  "[1:v]scale=1920:1080,format=rgb24,trim=duration=90,setpts=PTS-STARTPTS[c];[0:v]format=rgb24[v];[c][v]blend=all_expr='A*clip((T-87.3)/1.2,0,1)+B*(1-clip((T-87.3)/1.2,0,1))',format=yuv420p[o]" \
  -map "[o]" -t 90 -r 30 -c:v libx264 -preset slow -crf 14 -g 60 -movflags +faststart renders/opening-cycles-1080p30.mp4
sh ../empty-opening/mix.sh "$(pwd)/renders/opening-cycles-1080p30.mp4" "$(pwd)/renders/opening-cycles-1080p30-audio.mp4"
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,nb_frames:format=duration -of compact renders/opening-cycles-1080p30-audio.mp4
ffmpeg -v error -i renders/opening-cycles-1080p30-audio.mp4 -f null - && echo "decode: no errors"
