#!/bin/zsh
# Fetches the two proof-of-concept presenters and their animations from Microsoft Rocketbox (MIT licence),
# converts the textures for the web and applies the wardrobe pass. Run from this folder: ./fetch.sh
set -e
cd "$(dirname "$0")"
RAW=https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets
get() { mkdir -p "$(dirname "$2")"; [ -s "$2" ] || curl -sfL -o "$2" "$1"; }
for pair in "Male_Adult_16 m019" "Female_Adult_05 f005"; do
  set -- ${=pair}
  get "$RAW/Avatars/Adults/$1/Export/$1.fbx" "source/$1/$1.fbx"
  for t in body_color body_normal body_specular head_color head_normal head_specular opacity_color; do
    curl -sfL -o "source/$1/$2_$t.tga" "$RAW/Avatars/Adults/$1/Textures/$2_$t.tga" 2>/dev/null || rm -f "source/$1/$2_$t.tga"
  done
done
for n in m_sit_down_chair_01 f_sit_down_chair_01 f_idle_waiting_02; do get "$RAW/Animations/all_animations_max_motextr_xyz/$n.max.fbx" "source/anim/$n.fbx"; done
for n in m_walk_neutral_01 m_walk_start m_walk_stop f_walk_neutral_01 f_walk_self-assured f_walk_start f_walk_stop; do get "$RAW/Animations/all_animations_max_motextr_xy/$n.max.fbx" "source/anim/xy/$n.fbx"; done
mkdir -p web
for f in source/*/*.tga; do
  b=$(basename "$f" .tga)
  case $b in *normal*|*opacity*) sips -s format png -Z 1024 "$f" --out "web/$b.png" >/dev/null ;; *) sips -s format jpeg -s formatOptions 88 -Z 2048 "$f" --out "web/$b.jpg" >/dev/null ;; esac
done
python3 recolor.py
echo "Done: source/ (library files) and web/ (textures used by the PoC)."
