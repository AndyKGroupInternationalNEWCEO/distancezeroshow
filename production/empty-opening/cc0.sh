#!/bin/sh
# Free (CC0) material for the arrival's street, from Poly Haven (polyhaven.com, public domain, no attribution needed):
# wet asphalt, concrete paving slabs, the building's concrete panels, and a night HDRI of a modern city street for
# the sky, the buildings round about and the reflections in the wet ground.
#   sh production/empty-opening/cc0.sh   ->  out/cc0/
set -eu
cd "$(dirname "$0")"
mkdir -p out/cc0
T=https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k
for id in asphalt_02 concrete_floor_02 concrete_panels; do
  for m in diff nor_gl rough; do [ -s "out/cc0/${id}_$m.jpg" ] || curl -sfL -o "out/cc0/${id}_$m.jpg" "$T/$id/${id}_${m}_2k.jpg"; done
done
[ -s out/cc0/modern_buildings_night_4k.hdr ] || curl -sfL -o out/cc0/modern_buildings_night_4k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/modern_buildings_night_4k.hdr
ls -la out/cc0
