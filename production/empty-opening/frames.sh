#!/bin/sh
# The two videos the arrival cut (?cut=arrival) plays on the LED wall, as frame sequences, so every rendered frame
# shows exactly the right picture: the opening (the same as in the on-air simulation) and the studio background loop.
#   sh production/empty-opening/frames.sh   ->  out/frames/intro/0001.jpg …, out/frames/bg/0001.jpg …, out/frames/count.json
set -eu
cd "$(dirname "$0")"
for pair in "intro ../../assets/video/dz-logo-reveal.mp4" "bg ../../assets/video/dz-master-studio.mp4"; do
  set -- $pair
  rm -rf "out/frames/$1"; mkdir -p "out/frames/$1"
  ffmpeg -v error -y -i "$2" -q:v 2 "out/frames/$1/%04d.jpg"
done
printf '{"fps":24,"intro":%s,"bg":%s}\n' "$(ls out/frames/intro | wc -l | tr -d ' ')" "$(ls out/frames/bg | wc -l | tr -d ' ')" > out/frames/count.json
cat out/frames/count.json
