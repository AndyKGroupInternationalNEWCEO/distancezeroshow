#!/bin/sh
# Lays the official audio on the silent opening render, as in the approved sync sheet (version A):
#   0.00   theme (1.DISTANCE __ ZERO_master.wav) from 0.45 s into the file, so its 4.05 s hit lands on the key lights (3.60)
#   51.00  theme fades out over 3.5 s
#   53.75  opener (DISTANolohohCE __ ZERO_master.wav, "DISTANCE // ZERO — Opening", 0:35), 0.25 s fade-in;
#          its hits land on the cut to the logo (80.05) and on the clean frame (88.50)
#   sh production/opening/mix.sh [video in] [video out]
set -eu
cd "$(dirname "$0")"
IN="${1:-out/opening-1080p30.mp4}"; OUT="${2:-out/opening-1080p30-audio.mp4}"
SRC="../../../shared-assets/show DO"
ffmpeg -v error -y -i "$IN" -ss 0.45 -i "$SRC/1.DISTANCE __ ZERO_master.wav" -i "$SRC/DISTANolohohCE __ ZERO_master.wav" -filter_complex "
  [1:a]atrim=0:54.5,afade=t=out:st=51:d=3.5,asetpts=PTS-STARTPTS[theme];
  [2:a]afade=t=in:st=0:d=0.25,adelay=53750|53750[opener];
  [theme][opener]amix=inputs=2:normalize=0:duration=longest,apad,atrim=0:90[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -movflags +faststart "$OUT"
echo "$OUT"
