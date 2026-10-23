# Virtual Space — TODO

Open work, newest first. Done items move to the bottom with their commit.

## Now
- [ ] **Check live** (deployed 2026-10-23, dpl_DxezFRe7rRakaZCBQggBzTTHCUKK): Safari on the Mac and the iPad, the phone note on the iPhone.
- [ ] **Baked light for the reception and the building (Cycles on RunPod)**: the page's side is in (807dc16); the bake itself is not done (the dz-bake pod was deleted on 2026-10-23 with nothing fetched). Needs a GPU run again (≈ $1–2).
  - Export the places (reception, facade, street) from the live page as glTF on the pod (`export-probes.mjs places`).
  - In Blender: a second UV set as one atlas, Cycles bake of direct and indirect light (bounces, soft shadows, light from the chandelier, the desk, the canopy and the uplights), denoised.
  - In three.js: the baked light on the reception and the facade as a lightMap (uv1); the live lights there turned down; the wet street and moving things stay live.
  - The user checks it live in Safari.

## Next
- [ ] Opening videos for Piano and DJ from the 3D studio (my job; jingle and ident videos belong to the Claude chat).
- [ ] Piano keys: model quality up close.
- [ ] DJ: the EQ knobs change the sound (now they only move).
- [ ] Jingle videos: the DJ transition and closing videos are shorter than their audio (8 s against 80–100 s). Claude chat's job; write it the request.
- [ ] Broadcast Studio: 1:1 the Virtual Space UI, plus the remote, first person and MIDI. The BRODCASY session owns it, after the Virtual Space is done (see the memory file director-in-virtualspace-style).

## Done (latest)
- Piano Stage cameras stay inside the studio's wall (P5 showed the wall over half the picture) (e55f44a)
- Piano: songs from Songs crossfade; no fades where Safari fixes the volume (0a63605)
- The keys play the sheet music on the desk, six songs (f0c58cc, 6806259)
- Piano title up under ON AIR, off the keys (14db208)
- Piano Sessions cards PS_01–PS_05; Friday cards FR_01–FR_04 (3aa09fa, 25d42fc)
- Phones get a tablet-and-computer note (500ef11)
- Score on the desk readable; camera all round the set; no label selection (381a0f1)
- DJ: arrival shot of the closing glass floor; every simulation shot with the DJ (b5e6ce7, 16495d2)
- First person and overhead held still; short break between DJ tracks (d8102e4)
- Building and reception less raw: windows, uplights, chandelier (3e84f11)
- On-air lower third with artwork (b6e16b0)
- DJ Library crossfade; the old DJ BOOTH tab removed (e8f64e9)
- Desk monitors and microphones on the desk top (d0ab232)
- DJ overhead 4K camera (a6313ed)
- First person: drag to look round; the bar steps aside (6ea577f)
- Footer to one line, Info card (af648e2)
