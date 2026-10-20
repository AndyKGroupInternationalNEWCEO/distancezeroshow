# Vienna Piano Stage → Broadcast Studio: technical handoff

From the Virtual Studio (branch `feature/vienna-piano-stage`, worktree `~/DISTANCE-ZERO/virtual-space-vienna`) to the
Broadcast Studio (worktree `~/DISTANCE-ZERO/broadcast-studio`, `studio/`). Written 2026-10-20, from reading
the Broadcast Studio's code: `lib/stage.js`, `public/static/stage-bridge.js`, `obs-setup.js`, `shows/saturday.json`,
`shows/albums/deep-connections.json`. Nothing in the Broadcast Studio was changed or run.

## How the two connect today

- **The page:** the Broadcast Studio serves the stage page itself, at `/piano-stage/` on the Director port. It
  builds the page in memory from this worktree's `studio.html`, using the same three swaps as
  `virtual-studio/vienna/dev-page.mjs`, and adds `stage-bridge.js` and a clean-picture stylesheet.
- **Always the latest local state:** it reads the worktree directly, committed or not. After a change here,
  **Refresh** the OBS browser source *Piano Stage* to load it.
- **OBS input *Piano Stage*:** `?quality=broadcast&stagekey=…`, 1920 × 1080, 30 fps, with page audio routed into OBS
  (`reroute_audio`). It is never opened with `?obs=1`, which would start the studio's own on-air simulation.
- **Control:** the bridge drives the stage through `window.__studio.ext`, which exists on 127.0.0.1 only. It
  reports the stage's state twice a second.

### The interface the bridge uses (kept stable)

| The bridge calls | What it does |
|---|---|
| `ext.show.playSong({ id, title, album, audio, seconds })` | plays one recording on the show's song slot |
| `ext.showCommand('start' \| 'stop' \| 'restart' \| 'skip' \| 'live' \| 'between' \| 'between-stop' \| 'return-live' \| 'closing' \| 'closing-stop' \| 'closing-restart' \| 'song-stop' \| 'pause')` | the Piano Show |
| `ext.pickCamera('P1' … 'P5')` | the stage cameras |
| `ext.setMode('WARM PIANO' \| 'CINEMATIC' \| 'PERFORMANCE' \| 'BLACKOUT' \| 'LIFT REVEAL')` | lighting |
| `ext.command('up' \| 'down' \| 'stop' \| 'reset')` | the lift |
| reads `ext.show.{state, paused, segment, label, clock, time, duration, song, audio}`, `ext.program`, `ext.mode`, `ext.lift.{state, height}`, `ext.keyPlayer.part` | the report |

All of these are unchanged by today's work, and the stage's browser test (Chrome) exercises them.

## Answers

| Question | Status |
|---|---|
| Can the Broadcast Studio take the picture of the newest Piano Stage? | **Yes, by design.** It serves this worktree's current files. Live OBS was not checked from here: do one browser-source refresh and check the picture. |
| Do cameras P1–P5 switch? | **Yes:** the bridge's `cam` command calls `ext.pickCamera`. The stage's own test checks all five, with the lift down and up. |
| Music | The Piano Show's own recordings (opening, theme, between songs, closing) play from the page, and OBS captures them through *Piano Stage*. Songs play only the piano master the Broadcast Studio names: its playlist sends `cmd: 'song'` with `/piano-stage/master/<id>`. |
| Sound and microphone | The microphone on the stage is **visual only, with no audio**. The real host mic is an OBS input: *TALK* opens it and ducks the music −12 dB. Emergency *Mics off* mutes the inputs tagged MIC. |
| OBS | Driven only by the Director Studio (WebSocket 4455, localhost). The page never talks to OBS. |
| Small live host camera | The scene **PIANO STAGE** has *Cam // Andrej* over *Piano Stage* (runbook: "never over the keyboard"). **PIANO STAGE · CLEAN** has no host camera. It is set up in `obs-setup.js` and was not checked here in live OBS. |

## What the Broadcast Studio still lacks

1. **Piano masters:**
   - None of the six Deep Connections piano arrangements (`shared-assets/piano-sessions/deep-connections/02…07-*-piano.wav`) exists yet.
   - So the Saturday playlist's PLAY refuses every track. This is correct, but nothing can be played until they are delivered.
2. **Seek (optional):**
   - The stage now has `ext.show.seek(seconds)`, a jump within a running song.
   - The keys and the next camera cut follow it.
   - The bridge has no `seek` command yet. To add one: `case 'seek': ext.show.seek(+c.time); return;`
3. **A check in real OBS:**
   - Refresh *Piano Stage* and take P1–P5 with the bridge.
   - Run the opening (`start`) and the closing.
   - Check that the page audio reaches the OBS mixer and that the host camera sits clear of the keyboard in PIANO STAGE.
4. **Friday (DJ Sessions):**
   - `shows/friday.json` uses no Virtual Space picture today: its DJ scenes are *Cam // Andrej* and *Visuals Loop*.
   - When the Underground DJ Room exists, it needs:
     - an OBS input like *Piano Stage*;
     - a bridge for its cameras, light and platform (same pattern; see below).

## What the Virtual Studio provides on its side

- **Stable interface:** the interface above stays as it is. Any change will be announced first.
- **Clean picture:**
  - `.vz` (the stage panel) stays the only stage UI, and the clean stylesheet hides it.
  - Nothing new appears on screen outside the 3D scene.
- **Look:**
  - The page starts in the concert look, which includes the stage's one real key light.
  - `?look=studio` gives the studio look.
- **Show audio:**
  - The four show masters now stream when their segment starts (`preload = metadata`), instead of all loading
    with the page.
  - The audio element is the clock: pause, resume and seek keep picture, lift and keys in step with it.
- **Keys:** the keys move only from an approved piano part (`docs/vienna-stage/SCORE-IMPORT.md`). None exists, so they
  stay still. The bridge never loads one.
- **Public page:**
  - The same stage is public at **https://virtualspace.distancezeroshow.com/piano-stage** for viewing, once deployed.
  - It has no bridge, and `window.__studio` does not exist there.
  - For OBS on show day, use the Broadcast Studio's local `/piano-stage/`, which is the one the bridge can drive.
- **Underground DJ Room (Friday):** built on the same pattern as an `ext` extension of the studio page. It will
  offer its own controls for the Broadcast Studio:
  - cameras;
  - lighting modes;
  - platform `down` / `up` / `stop` / `reset`;
  - a report.

  The method names will be documented here before a bridge is written for them.
