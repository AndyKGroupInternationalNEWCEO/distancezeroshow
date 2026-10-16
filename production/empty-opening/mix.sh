#!/bin/sh
# Lays the official audio on the silent empty-studio opening, on the approved sync of the first opening (version A):
#   0.00   theme (1.DISTANCE __ ZERO_master.wav) from 0.45 s into the file, so its 4.05 s hit lands on the key lights (3.60)
#   51.00  theme fades out over 3.5 s
#   53.75  opener ("DISTANCE // ZERO — Opening", 0:35), 0.25 s fade-in; its hits land on ON AIR (80.05) and the full frame (88.50)
#   77, 78, 79  the beacons' cue: a deep whoop (300 -> 760 Hz, 0.42 s) with each of the three flashes
#   sh production/empty-opening/mix.sh [video in] [video out]
set -eu
cd "$(dirname "$0")"
IN="${1:-out/empty-opening-1080p30.mp4}"; OUT="${2:-out/empty-opening-1080p30-audio.mp4}"
SRC="../../../shared-assets/show DO"
ffmpeg -v error -y -i "$IN" -ss 0.45 -i "$SRC/1.DISTANCE __ ZERO_master.wav" -i "$SRC/DISTANolohohCE __ ZERO_master.wav" \
  -f lavfi -i "aevalsrc='between(t,0,0.42)*min(1,t/0.012)*min(1,(0.42-t)/0.08)*0.42*tanh(1.6*(sin(2*PI*(300*t+460*t*t/0.84))+0.5*sin(4*PI*(300*t+460*t*t/0.84))+0.28*sin(6*PI*(300*t+460*t*t/0.84))))':s=48000:d=0.45" -filter_complex "
  [1:a]atrim=0:54.5,afade=t=out:st=51:d=3.5,asetpts=PTS-STARTPTS[theme];
  [2:a]afade=t=in:st=0:d=0.25,adelay=53750|53750[opener];
  [3:a]aformat=channel_layouts=stereo,asplit=3[b1][b2][b3];
  [b1]adelay=77000|77000[t1]; [b2]adelay=78000|78000[t2]; [b3]adelay=79000|79000[t3];
  [theme][opener][t1][t2][t3]amix=inputs=5:normalize=0:duration=longest,alimiter=limit=0.89:level=false,apad,atrim=0:90[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -movflags +faststart "$OUT"
echo "$OUT"
