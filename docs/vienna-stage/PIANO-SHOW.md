# D//0 — PIANO SESSIONS · show simulation

The show runs on the Vienna Piano Stage: the studio's own grand at its original place, its lift, lights and cameras
P1–P5. The full run:

1. **Short opening** (official ident)
2. **Long opening** (official piano theme)
3. **Live piano performance**
4. **Between songs** (official ident) — started by hand, as often as wanted, back to live after it
5. **Closing** (official closing ident)
6. **Show ended**

It is a local simulation. Nothing is sent to OBS, YouTube or Melbourne.

## Audio

| | Master (original, unchanged) | In the project | Length | Format | SHA-256 |
|---|---|---|---|---|---|
| Short opening | `~/Desktop/D::0 Piano session/D__0 Piano Sessions Opening_master.wav` | `assets/audio/piano-sessions/dz-piano-sessions-opening.wav` | **44.400 s** | WAV, 48 kHz, 16-bit, stereo | `f8080f70…3dc96` |
| Piano theme | `~/Desktop/D::0 Piano session/Distance Zero ( piano studio )_master.wav` | `assets/audio/piano-sessions/dz-piano-theme.wav` | **328.920 s** (5:28.9) | WAV, 48 kHz, 16-bit, stereo | `aa220cb5…3d988` |
| Between songs | `~/Desktop/D::0 Piano session/Distance Zero ( between song )_master.wav` | `assets/audio/piano-sessions/dz-piano-between-songs.wav` | **29.560 s** | WAV, 48 kHz, 16-bit, stereo | `f3526f69…bbd83a` |
| Closing | `~/Desktop/D::0 Piano session/D__0 Piano Sessions closing_master.wav` | `assets/audio/piano-sessions/dz-piano-sessions-closing.wav` | **38.400 s** | WAV, 48 kHz, 16-bit, stereo | `76155fba…16193` |

- **Not in git:** the copies are git-ignored (85 MB together). Copy them again from the masters on a fresh checkout.
- **Not in the public site:** the Virtual Space build (`virtualspace/build.mjs`) does not include them.

### Timing comes from the recordings

`node virtual-studio/vienna/audio-map.mjs` reads both WAVs and writes `virtual-studio/vienna/piano-show-map.js`:
- the exact durations;
- the onsets (accents);
- the loud, mid and quiet sections.

`show.js` builds the camera and lighting script from that map. At run time each file's own duration is checked
against the map, and the panel warns if a master was changed without running the script again.

**Measured.**

Opening onsets, with the average loudness of the next 5 s:

| Time | Next 5 s |
|---|---|
| 4.5 s | −10.9 dB |
| 10.0 s | −10.7 dB |
| 21.5 s | −10.4 dB |
| 32.5 s | −14.4 dB |
| 39.0 s | −16.4 dB |

The tail fades out from about 41 s.

Theme sections:

| From | To | Energy | Loudness |
|---|---|---|---|
| 0 | 33 | mid | −13.6 dB |
| 33 | 55.5 | quiet | −17.2 dB |
| 55.5 | 72.5 | loud | −11.6 dB |
| 72.5 | 99 | mid | −13.2 dB |
| 99 | 115 | loud | −9.4 dB |
| 115 | 131 | quiet | −16.5 dB |
| 131 | 138 | mid | −12.1 dB |
| 138 | 201 | loud | −8.6 dB |
| 201 | 225.5 | quiet | −19.5 dB |
| 225.5 | 253 | loud | −8.9 dB |
| 253 | 272.5 | quiet | −18.7 dB |
| 272.5 | 313 | loud — climax | −7.4 dB |
| 313 | 328.92 | quiet (outro) | −22.3 dB |

## The script, as generated

**Short opening (44.4 s):**

| Time | Shot | Lights / stage | Rule |
|---|---|---|---|
| 0 | P4 lift reveal | LIFT REVEAL, under-light and spot held dark | start |
| 4.5 | | under-platform light | first accent |
| 8.88 | | **lift sets off** | arrival − rise time (12.62 s, from the lift's own motion profile) |
| 10.0 | P5 elevated tracking | | first accent after the lift sets off |
| **21.5** | P1 main front | **platform arrives**, PERFORMANCE, performance spot | the accent opening the loudest 5 s, once the lift has had time to rise |
| 27.0 | P3 side | | middle of a stretch over 9 s |
| 32.5 | P2 keys | CINEMATIC | accent |
| 39.0 | P4 wide | PERFORMANCE, spot | last accent before the tail |
| 41.9 | | CINEMATIC | 2.5 s before the end |
| 44.4 | → theme | | end of the file |

**Piano theme (328.9 s):**
- **Lighting per section:** quiet → WARM PIANO, mid and loud → CINEMATIC, climax → PERFORMANCE with the spot.
- **Shot length:** 12 s quiet, 10 s mid, 8 s loud.
- **Cameras:**
  - quiet: P2, P3, P1
  - mid: P1, P3, P5, P2
  - loud: P4, P1, P5, P3
  - never the same camera twice in a row
- **Cuts** move onto a measured onset when one is within 1.5 s.
- **Outro:** the closing quiet section starts on P1.
- **Totals:** 35 cues in all. All of it can be adjusted in `piano-show-config.js`.

**Live piano performance:** stops all audio, P1, WARM PIANO at full level, the platform stays up, and everything is
manual.

**Between songs (29.56 s)** has accents at 2.0, 12.5 and 22.5 s and dies away from 28.0 s. Warm light, no lift
movement, and the stage cameras' slow drift throughout:

| Time | Shot | Lights / stage |
|---|---|---|
| 0 | P2 keys | WARM PIANO at full level |
| 6.25 | P3 side | |
| 12.5 | P2 keys | |
| 17.5 | P5 | |
| 22.5 | P1 front | |
| end of the recording | → back to LIVE | |

**Closing (38.4 s)** has accents at 2.0, 19.0, 22.0 and 31.0 s and dies away from 35.5 s. The light comes down at
every cut along a straight line to 35 % at the die-away (eased, so it fades rather than steps):

| Time | Shot | Lights / stage |
|---|---|---|
| 0 | P5 | CINEMATIC, light at 100 % |
| 9.5 | P3 | 83 % |
| 19.0 | P4 wide | 65 % |
| 31.0 | P1 front | **last shot:** WARM PIANO, soft spot, 43 % — the grand with the DISTANCE // ZERO logo |
| 35.5 | | 35 % |
| end of the recording | **SHOW ENDED** | last shot and soft light stay |

Shots are at least 7 s long in the closing and 5 s in between songs (`minShot` in `piano-show-config.js`).

## Controls (panel, top section)

| Button | What it does |
|---|---|
| START PIANO SHOW | Lowers the platform first if it is not down (PREPARING), then plays the opening from 0. Refused while the show runs. |
| PAUSE / RESUME | Pauses or resumes the audio. The lift freezes and resumes with it, so sound and picture cannot drift. |
| STOP SHOW | Stops all audio. The stage stays as it is, under manual control. |
| RESTART OPENING | Stops whatever plays, lowers the platform if needed, and plays the opening from 0. |
| SKIP TO LONG THEME | Stops the opening and plays the theme from 0. The platform goes up if it is not already. |
| GO LIVE — PIANO | Stops all audio and goes to LIVE PIANO PERFORMANCE. |
| VIDEO / 3D | Only when an opening video is configured. Switches between the video and the live 3D studio. |

| PLAY BETWEEN SONGS | Plays the between-songs ident from LIVE (or LIVE again after one), as often as wanted. It never starts by itself and never moves the lift. Refused during the openings. |
| STOP BETWEEN SONGS | Stops it and returns to LIVE. |
| RETURN TO LIVE PIANO | Stops whatever plays and returns to LIVE. |
| START CLOSING | Stops whatever plays and plays the closing. SHOW ENDED follows once the recording has died away (its natural end, not a cut). |
| STOP CLOSING | Stops it and returns to LIVE at full light. |
| RESTART CLOSING | Plays the closing again from the top. |

The panel shows the segment, its progress bar, elapsed / total and remaining time, and whether the audio or the
show clock is driving.

**Manual control always works during the show:**
- A **camera** button takes the cameras over until the next segment.
- A **lighting mode** button takes the lights over until the next segment.
- Any **lift** button (UP, STOP, DOWN, RESET) takes the lift over for the rest of the show. STOP always brakes the lift.

Any lighting mode button also brings the overall light back to full (the closing's dimming).

## Guarantees

- **One audio at a time:** starting a segment stops every other one first. Tested: never more than one audio
  element playing during a full run; START twice is refused.
- **Sound and picture stay in step:**
  - The show's clock *is* the audio element's `currentTime`.
  - While paused, the audio does not advance and the lift does not move. After resuming, the platform still arrives
    on the accent (tested).
  - If a file cannot be played, the show runs on its own clock with the same script and says so.
- **No second render:** the show adds audio only. The 3D work is the stage's existing cameras and lights.
- **OBS (later):** the audio plays in the page. An OBS browser source on the studio page with **Control audio via
  OBS** checked captures it with the picture. Nothing in the page sends anything to OBS.

## Opening video (to come)

Set `SHOW.opening.video` in `piano-show-config.js` to the delivered file, for example
`assets/video/dz-piano-sessions-opening.mp4`. Then:
- **Picture:** the video plays muted and full-frame over the 3D studio during the opening.
- **Sync:** the official audio stays the master clock, and the video is kept within 0.12 s of it.
- **3D underneath:** the 3D opening runs under the video, so the stage is already up when the video ends.
- **End of the video:** it cross-fades (`videoFade`, 1.2 s) into the live Piano Stage.
- **VIDEO / 3D button:** switches between the video and the 3D studio during the opening.
- **Pause, resume, restart and skip:** apply to the video as well.

No scene changes are needed. **Not yet tested with a real video:** none exists yet, and none was made up.

## Preview and tests

```sh
cd ~/DISTANCE-ZERO/virtual-space-vienna
node virtual-studio/vienna/dev-page.mjs
node virtual-studio/vienna/serve.mjs            # a local server with byte ranges (needed to seek in the long WAVs)
open http://127.0.0.1:8130/vienna-dev.html
node virtual-studio/vienna/e2e.mjs              # the whole page incl. one real-time show run (~15 min), audio muted
SHOW=0 node virtual-studio/vienna/e2e.mjs       # without the show's real-time run
HEADFUL=1 node virtual-studio/vienna/e2e.mjs    # in a normal Chrome window instead of headless
```
