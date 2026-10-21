# Saturday Piano Sessions opening: Broadcast Studio → Virtual Space handoff

This handoff goes from the Broadcast Studio (`~/DISTANCE-ZERO/broadcast-studio/studio`, branch `studio/weekly-shows`)
to the Virtual Space stage (`~/DISTANCE-ZERO/virtual-space-vienna`, branch `feature/vienna-piano-stage`).
It was written on 21 Oct 2026. Nothing in the Virtual Space worktree was changed.

## The opening Andrej wants

In the Broadcast Studio, each step is one GO:

| Step | Rundown segment | OBS scene | What happens | Status |
|---|---|---|---|---|
| 1 PLAY OPENING VIDEO | OPENING VIDEO — PIANO SESSIONS | OPENING | Video Player plays V35, the Piano Sessions opening film, with its own sound | Studio side is ready. **The film is not delivered yet.** Expected file: `shared-assets/piano-sessions/opening/PIANO SESSIONS — OPENING_1080p.mp4` |
| 2 HOST WELCOME | HOST WELCOME | HOST · PIANO | Andrej's real camera, full screen, at his piano. Mic via TALK. No song starts. | Studio side is ready |
| 3 START CINEMATIC TRANSITION | CINEMATIC STUDIO TRANSITION | PIANO STAGE · CLEAN | The stage gets `transition` (below) | **Needs the Virtual Space** |
| 4 ENTER PIANO PERFORMANCE | PIANO PERFORMANCE — LIVE STAGE | PIANO STAGE | The stage gets `live`. Host camera is small at the bottom (x 40, y 824, 384 × 216). Songs start only on PLAY. | Studio side is ready |

## What the stage needs: `ext.cinematicTransition()`

The bridge (`studio/public/static/stage-bridge.js`) calls `ext.cinematicTransition()` when GO fires step 3.
Until that function exists, the bridge answers *"This Piano Stage has no cinematic transition yet"*. The Director
sees that message, and the picture stays on the stage.

1. **The flight.** A short camera flight (about 20–40 s) through the existing studio: the whole room, its
   architecture, the lights, the grand piano and the big monitors.
   - Existing models only: no new studio, and no virtual pianist.
   - The keys stay still unless an approved part exists.
2. **The main monitor.** The flight comes back to the main LED wall.
   - From the start of the flight, the wall shows the live Piano Stage feed: `setSource('vienna')`, a camera P1–P5.
   - The camera then moves in until the wall's picture fills the whole 1920 × 1080 frame.
3. **No black, no jump.** At the end, the camera switches to the very program camera the wall was showing,
   full frame.
   - The cut has to be invisible: the same shot, the same light, no wall mirroring, no 15 fps feed on the last frames.
   - Then the stage stays on that camera, ready for LIVE PIANO.
4. **Report.** While it runs, `ext.show.state` (or another field the bridge can read) says `TRANSITION`, so the
   Director sees it, with time and duration if possible.
   - After it, the state is the stage's normal idle or live state.
5. **Sound.** No new music in the transition unless Andrej asks for it.
   - The stage's existing piano audio idents (opening, between songs, closing) stay as they are.
   - Picture and audio stay in sync. The audio element stays the clock where one plays.
6. **OBS picture.** It must look right in the OBS browser source: `?quality=broadcast&stagekey=…`, 1920 × 1080,
   30 fps, clean-picture stylesheet, never `?obs=1`.
   - Please check the final frames in that mode on an 8 GB MacBook Air M2.

## What the Broadcast Studio does around it

- Step 3 cuts OBS to **PIANO STAGE · CLEAN**, which is the same *Piano Stage* browser source without the host
  camera, then sends `transition`.
- Step 4 cuts to **PIANO STAGE**: the same source plus the small host camera, then sends `live`.
  - Because both scenes show the same source, the picture does not change at that cut. Only the small camera appears.
- During songs the stage's cameras P1–P5 and lights follow the music, as they already do.
  The bridge never turns on the studio's own auto tour.

## Open point for Andrej

**DISTANCE // ZERO (Piano Version).**
- The old first segment ran the stage's official short opening (44 s) and the D//Z piano version (5:29).
- Both are still on the stage, and a button in Show Control → Playlist still starts them.
- The new step 1 is the film, so the HOST WELCOME script line *"You've just heard the piano interpretation of our
  DISTANCE // ZERO theme"* is only true if the film uses that theme.
