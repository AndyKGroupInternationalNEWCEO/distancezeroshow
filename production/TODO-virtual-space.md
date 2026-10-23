# Virtual Space — TODO

Open work, newest first. Done items move to the bottom with their commit.

## Now
- [ ] **Baked light for the reception and the building (Cycles on RunPod)**
  - Export the places (reception, facade, street) from the live page as glTF on the pod (`export-probes.mjs places`).
  - In Blender: a second UV set as one atlas, Cycles bake of direct and indirect light (bounces, soft shadows, light from the chandelier, the desk, the canopy and the uplights), denoised.
  - In three.js: the baked light on the reception and the facade as a lightMap (uv1); the live lights there turned down; the wet street and moving things stay live.
  - The user checks it live in Safari.

## Next
- [ ] Piano: a crossfade when a song is changed from Songs (the DJ Library already mixes).
- [ ] Opening videos for Piano and DJ from the 3D studio (my job; jingle and ident videos belong to the Claude chat).
- [ ] Piano keys: model quality up close.
- [ ] DJ: the EQ knobs change the sound (now they only move).
- [ ] Jingle videos: the DJ transition and closing videos are shorter than their audio (8 s against 80–100 s). Claude chat's job; write it the request.
- [ ] Broadcast Studio: 1:1 the Virtual Space UI, plus the remote, first person and MIDI. The BRODCASY session owns it, after the Virtual Space is done (see the memory file director-in-virtualspace-style).

## Done (latest)
- Building and reception less raw: windows, uplights, chandelier (3e84f11)
- On-air lower third with artwork (b6e16b0)
- DJ Library crossfade; the old DJ BOOTH tab removed (e8f64e9)
- Desk monitors and microphones on the desk top (d0ab232)
- DJ overhead 4K camera (a6313ed)
- First person: drag to look round; the bar steps aside (6ea577f)
- Footer to one line, Info card (af648e2)
