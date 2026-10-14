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
