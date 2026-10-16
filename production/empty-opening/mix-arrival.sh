#!/bin/sh
# Sound for the arrival cut (render.mjs --query cut=arrival): the arrival's own sound (arrival-sfx.mjs) for its 25 s,
# then the opening's mix exactly as mix.sh lays it, 25 s later; from the loop on the wall (113.5 s) the loop's own
# sound, low, under the show's Three-Note Signature as background music, from the opener's last hit to the end.
#   sh production/empty-opening/mix-arrival.sh [video in] [video out]
set -eu
cd "$(dirname "$0")"
IN="${1:-out/arrival-1080p30.mp4}"; OUT="${2:-out/arrival-1080p30-audio.mp4}"
SRC="../../../shared-assets/show DO"
P=25000   # the arrival's length, ms
node arrival-sfx.mjs
ffmpeg -v error -y -i "$IN" -ss 0.45 -i "$SRC/1.DISTANCE __ ZERO_master.wav" -i "$SRC/DISTANolohohCE __ ZERO_master.wav" \
  -f lavfi -i "aevalsrc='between(t,0,0.42)*min(1,t/0.012)*min(1,(0.42-t)/0.08)*0.42*tanh(1.6*(sin(2*PI*(300*t+460*t*t/0.84))+0.5*sin(4*PI*(300*t+460*t*t/0.84))+0.28*sin(6*PI*(300*t+460*t*t/0.84))))':s=48000:d=0.45" \
  -i out/arrival-sfx.wav -stream_loop -1 -i ../../assets/video/dz-master-studio.mp4 -i "$SRC/DISTANCE ZERO - Three-Note Signature.wav" -filter_complex "
  [1:a]atrim=0:54.5,afade=t=out:st=51:d=3.5,asetpts=PTS-STARTPTS,adelay=$P|$P[theme];
  [2:a]afade=t=in:st=0:d=0.25,adelay=$((53750 + P))|$((53750 + P))[opener];
  [3:a]aformat=channel_layouts=stereo,asplit=3[b1][b2][b3];
  [b1]adelay=$((77000 + P))|$((77000 + P))[t1]; [b2]adelay=$((78000 + P))|$((78000 + P))[t2]; [b3]adelay=$((79000 + P))|$((79000 + P))[t3];
  [4:a]aformat=sample_rates=48000:channel_layouts=stereo[sfx];
  [5:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:16.5,asetpts=PTS-STARTPTS,volume=0.6,afade=t=in:st=0:d=0.6,afade=t=out:st=15.5:d=1,adelay=$((88500 + P))|$((88500 + P))[loop];
  [6:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:17,asetpts=PTS-STARTPTS,volume=0.45,afade=t=in:st=0:d=2,afade=t=out:st=15:d=2,adelay=$((88200 + P))|$((88200 + P))[sig];
  [theme][opener][t1][t2][t3][sfx][loop][sig]amix=inputs=8:normalize=0:duration=longest,alimiter=limit=0.89:level=false,apad,atrim=0:130[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -movflags +faststart "$OUT"
echo "$OUT"
