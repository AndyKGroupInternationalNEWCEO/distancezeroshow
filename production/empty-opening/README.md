# Empty-studio opening (90 s) and the way into the live picture

The real DISTANCE // ZERO studio before a show, nobody in it, as if seen through its own cameras: it wakes up, the
cameras look round the empty desk, the DJ booth (Melbourne side) and the grand (Vienna side), the on-air beacons turn,
flash three times with a tone and the studio is on air. The big logo comes up on the LED wall and the camera flies to
it until the wall's picture fills the frame. Built from the current Virtual Space set, with free tools only
(three.js in headless Chrome, ffmpeg).

| File (in `out/`, not in git) | What it is |
|---|---|
| `empty-opening-1080p30-audio.mp4` | The opening, 1920×1080, 30 fps, with the theme, the opener and the three cue tones |
| `empty-opening-1080p30.mp4` | The same, silent |
| `still-89.00.png` | Its last frame: the clean logo card (88.5–90 s) |
| `stinger-through-logo.webm` / `.mov` | OBS stinger with alpha (VP9 / ProRes 4444), 1.4 s: from that card, through the `//` of the logo into the live picture |
| `stinger-preview.mp4` | The stinger over a stand-in picture, to look at |

## Timeline

| s | |
|---|---|
| 0–15 | Black, work lights, key lights on the theme's hit (3.6), LED strips, wall Vienna / Melbourne |
| 15–28 | Along the empty desk |
| 28–40 | The DJ booth, Melbourne side |
| 40–52 | The grand, Vienna side |
| 52–64 | Behind the studio cameras |
| 64–77 | The crane, high: the beacons turn (standby) |
| 77, 78, 79 | Flash + tone, three times |
| 80 | ON AIR (the opener's hit): the logo on the wall, the fly to it begins |
| 88.5–90 | The wall's picture fills the frame: the clean card |

## For the Broadcast Studio (not set up from here)

Play the opening; at its end (on the clean card) switch to the live camera scene with the stinger as the transition,
transition point 0 ms. The live picture of Andy'K and Georgie then appears through the logo.

## Make it again

    node production/empty-opening/render.mjs                 # silent video (about 18 min on the MacBook Air)
    node production/empty-opening/render.mjs --stills 46,89  # single frames
    sh production/empty-opening/mix.sh                       # audio
    sh production/empty-opening/stinger.sh                   # stinger + preview

Preview in the browser: serve the repository and open `production/empty-opening/index.html`.

## The arrival cut (`?cut=arrival`, 130 s)

The same opening with the presenters' arrival before it and a new end after ON AIR. The 90 s cut above is unchanged.

| s | |
|---|---|
| 0–3.6 | Night: the studio building, wide (wet pavement, uplit concrete, the D//0 sign, the lit lobby) |
| 3.6–7.4 | Andy'K's and Georgie's shoes on the wet slabs, in at the glass doors (no faces: the camera stays at ankle height) |
| 7.4–11 | The lobby: the reception desk with the D//0 logo lit in its front; they walk on past it to the corridor |
| 11–20.4 | The backstage lounge: out of the dressing rooms to their armchairs, and down |
| 20.4–25 | The camera goes on alone through the BACKSTAGE door into the dark studio |
| 25–105 | The 90 s opening's first 80 s (all cue times + 25 s); the beacons go dark after their three flashes |
| 105.4 | The wall plays the opening video (`assets/video/dz-logo-reveal.mp4`, as in the on-air simulation) |
| 113.5 | The wall plays the studio background loop (`assets/video/dz-master-studio.mp4`) |
| 120.5–130 | The loop fills the frame, clean: the live cameras go over it. The camera never pulls back |

The presenters are the Rocketbox avatars (MIT, see `../avatars/README.md`), not likenesses; only their legs and shoes
are seen, dressed as in the references by `../avatars/wardrobe_show.py` (Andy'K: black trousers and black leather
shoes; Georgie: slim black trousers, her black shoes). Realism: Poly Haven CC0 concrete, paving and asphalt (`cc0.sh`)
tinted to the street's own tones, wet reflections blurred and broken up by the surface (not a mirror), the night city
HDRI only as reflections in glass and wet ground, contact shadows under the shoes, walks fitted to whole strides (no
sliding), a smoothly eased dolly, and motion blur (`--blur 4`, a 180° shutter). The arrival's sound (city, drizzle,
footsteps on the measured foot contacts, the doors, room tone) is made by `arrival-sfx.mjs`, no library sounds.

    sh production/empty-opening/cc0.sh                               # CC0 textures and the night HDRI
    sh production/empty-opening/frames.sh                            # the wall's two videos as frame sequences
    node production/empty-opening/render.mjs --query cut=arrival --blur 4   # out/arrival-1080p30-blur4.mp4 (+ arrival-steps.json)
    sh production/empty-opening/mix-arrival.sh out/arrival-1080p30-blur4.mp4

Preview: `production/empty-opening/index.html?cut=arrival`.
